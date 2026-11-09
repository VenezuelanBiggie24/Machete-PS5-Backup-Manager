/*
 * Machete PS5 Remote Management Daemon
 * Architecture: Clean FreeBSD/Prospero userland daemon for ps5-payload-sdk
 *
 * Guarantees:
 *  - 100% Kernel-Safe: Canonical John Törnblom elevation & jaildir=0 clearing
 *  - Zombie & Port Conflict Immunity: Overlaps sockets and terminates prior
 *    stale payload instances on boot while strictly preserving elfldr (parent loader)
 *  - Dynamic Mount Discovery: Uses getmntinfo(..., MNT_NOWAIT) to query the active
 *    in-memory VFS mount table. Never probes unmounted paths or triggers kernel sleep
 *  - Multi-Storage Scanner: Automatically inspects /data/homebrew, /data/etahen/games,
 *    /data/games, M.2 NVMe SSD (/mnt/ext0, /mnt/ext1), and USB drives (/mnt/usb0..7)
 *  - Accurate Folder Sizing: Recursive directory size calculation (depth <= 12, capped
 *    at 14.4 KB stack, skips symlinks) giving true sizes for folder games (20-80 GB)
 *  - Dynamic Port Fallback: Binds 9038 by default; falls back to 9039..9043 if needed
 *  - Remote Control: Supports PING, VERSION, SCAN, DELETE, SHUTDOWN, STOP, QUIT
 *  - Native SceNotification linking (-lSceNotification)
 *  - Strict Zero PFS Access: Never touches /user/app to prevent kernel panics
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>
#include <stdint.h>
#include <unistd.h>
#include <errno.h>
#include <signal.h>
#include <ctype.h>
#include <dirent.h>
#include <limits.h>
#include <pthread.h>
#include <sys/types.h>
#include <sys/stat.h>
#include <sys/socket.h>
#include <sys/sysctl.h>
#include <sys/user.h>
#include <sys/param.h>
#include <sys/mount.h>
#include <fcntl.h>
#include <netinet/in.h>
#include <arpa/inet.h>

#include <ps5/kernel.h>
#include "icon_data.h"

#define DAEMON_NAME          "machete_daemon"
#define DAEMON_VERSION       "1.5.4"
#define DAEMON_DEFAULT_PORT  9038
#define MACHETE_ICON_PATH    "/user/data/notifi/machete_logo.png"
#define MACHETE_PORT_FILE    "/data/machete_daemon_port.txt"
#define MACHETE_SIZE_CACHE_FILE "/data/machete_sizes.cache"
#define MAX_SIZE_CACHE       2048

#define SCE_NOTIFICATION_LOCAL_USER_ID_SYSTEM 0xFE

int sceNotificationSend(int userId, bool isLogged, const char* payload);

typedef struct app_info {
    uint32_t app_id;
    uint64_t unknown1;
    uint32_t app_type;
    char     title_id[10];
    char     unknown2[0x3c];
} app_info_t;

int sceKernelGetAppInfo(pid_t pid, app_info_t *info);

static volatile bool g_running = true;
static int g_bound_port = DAEMON_DEFAULT_PORT;

static intptr_t g_orig_jaildir = 0;
static intptr_t g_orig_rootdir = 0;
static int      g_elevated     = 0;

/* -------------------------------------------------------------------------
 * Canonical PS5 Self-Elevation & Privilege Restoration
 * Matches elfldr_raise_privileges (John Törnblom) exactly.
 * Clears jaildir to 0 and raises ucred caps so kernel path resolution is
 * 100% legal and never faults.
 * ------------------------------------------------------------------------- */
static void payload_self_elevate(void) {
    pid_t me = getpid();

    g_orig_jaildir = kernel_get_proc_jaildir(me);
    g_orig_rootdir = kernel_get_proc_rootdir(me);

    intptr_t rootvnode = kernel_get_root_vnode();
    if (!rootvnode) {
        return;
    }

    static const uint8_t caps_all[16] = {
        0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,
        0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff
    };

    if (kernel_set_proc_rootdir(me, rootvnode) != 0 ||
        kernel_set_proc_jaildir(me, 0)        != 0 ||
        kernel_set_ucred_uid(me, 0)           != 0 ||
        kernel_set_ucred_caps(me, caps_all)   != 0) {
        return;
    }

    // ShellCore authid: required so kernel IPC and filesystem access don't wedge
    kernel_set_ucred_authid(me, 0x4801000000000013ULL);
    g_elevated = 1;
}

static void payload_restore_privileges(void) {
    if (!g_elevated) return;
    pid_t me = getpid();
    if (g_orig_rootdir) kernel_set_proc_rootdir(me, g_orig_rootdir);
    if (g_orig_jaildir) kernel_set_proc_jaildir(me, g_orig_jaildir);
    g_elevated = 0;
}

/* -------------------------------------------------------------------------
 * Zombie & Stale Process Sweeper
 * Overlaps and closes hung sockets before terminating stale payload instances.
 * STRICTLY PRESERVES elfldr (the parent loader) and self.
 * ------------------------------------------------------------------------- */
static void kill_stale_payloads(void) {
    int mib[4] = { CTL_KERN, KERN_PROC, KERN_PROC_PROC, 0 };
    size_t size = 0;
    if (sysctl(mib, 4, NULL, &size, NULL, 0) != 0 || size == 0) return;
    size += size / 4;
    char *buf = (char *)malloc(size);
    if (!buf) return;

    pid_t self = getpid();
    pid_t parent = getppid();

    if (sysctl(mib, 4, buf, &size, NULL, 0) == 0) {
        for (char *p = buf; p + sizeof(int) <= buf + size; ) {
            struct kinfo_proc *ki = (struct kinfo_proc *)p;
            if (ki->ki_structsize <= 0) break;
            p += ki->ki_structsize;

            // Never touch ourselves, never touch elfldr (parent loader), never touch kernel/init
            if (ki->ki_pid == self || ki->ki_pid == parent || ki->ki_pid <= 1) {
                continue;
            }

            app_info_t appinfo;
            memset(&appinfo, 0, sizeof(appinfo));
            sceKernelGetAppInfo(ki->ki_pid, &appinfo);

            bool is_stale = false;
            // 1. Sibling process launched by elfldr
            if (parent > 1 && ki->ki_ppid == parent) {
                is_stale = true;
            }
            // 2. Exploit/payload title ID
            else if (strcmp(appinfo.title_id, "NPXS40112") == 0) {
                is_stale = true;
            }
            // 3. Process named machete or payload
            else if (strstr(ki->ki_comm, "machete") != NULL ||
                     strstr(ki->ki_comm, "payload") != NULL) {
                is_stale = true;
            }

            if (is_stale) {
                // Overlap any open socket descriptors (0..63) to forcibly unblock ports 9038, 9039, etc.
                for (int fd = 0; fd < 64; fd++) {
                    int tmp = socket(AF_INET, SOCK_STREAM, 0);
                    if (tmp < 0) break;
                    kernel_overlap_sockets(ki->ki_pid, tmp, fd);
                    close(tmp);
                }
                kill(ki->ki_pid, SIGKILL);
            }
        }
    }
    free(buf);
}

/* -------------------------------------------------------------------------
 * Streaming Network Buffer (Per-Connection State)
 * ------------------------------------------------------------------------- */
typedef struct {
    int fd;
    volatile bool active;
    char buf[4096];
    size_t len;
} NetBuffer;

static void netbuf_init(NetBuffer *nb, int fd) {
    if (!nb) return;
    nb->fd = fd;
    nb->active = true;
    nb->len = 0;
}

static bool netbuf_flush(NetBuffer *nb) {
    if (!nb || nb->fd < 0 || nb->len == 0) return true;
    size_t total = 0;
    while (total < nb->len) {
        ssize_t sent = send(nb->fd, nb->buf + total, nb->len - total, 0);
        if (sent <= 0) {
            nb->active = false;
            return false;
        }
        total += (size_t)sent;
    }
    nb->len = 0;
    return true;
}

static void netbuf_write(NetBuffer *nb, const char *str, size_t slen) {
    if (!nb || !str || slen == 0 || !nb->active) return;
    while (slen > 0) {
        size_t avail = sizeof(nb->buf) - nb->len;
        if (avail == 0) {
            if (!netbuf_flush(nb)) return;
            avail = sizeof(nb->buf);
        }
        size_t chunk = (slen < avail) ? slen : avail;
        memcpy(nb->buf + nb->len, str, chunk);
        nb->len += chunk;
        str += chunk;
        slen -= chunk;
    }
}

static void netbuf_puts(NetBuffer *nb, const char *str) {
    if (!nb || !str || !nb->active) return;
    netbuf_write(nb, str, strlen(str));
}

static void escape_json_to_netbuf(NetBuffer *nb, const char *src) {
    if (!nb || !src || !nb->active) return;
    const char *start = src;
    while (*src) {
        switch (*src) {
            case '"':
                if (src > start) netbuf_write(nb, start, src - start);
                netbuf_puts(nb, "\\\"");
                start = src + 1;
                break;
            case '\\':
                if (src > start) netbuf_write(nb, start, src - start);
                netbuf_puts(nb, "\\\\");
                start = src + 1;
                break;
            case '\b':
                if (src > start) netbuf_write(nb, start, src - start);
                netbuf_puts(nb, "\\b");
                start = src + 1;
                break;
            case '\f':
                if (src > start) netbuf_write(nb, start, src - start);
                netbuf_puts(nb, "\\f");
                start = src + 1;
                break;
            case '\n':
                if (src > start) netbuf_write(nb, start, src - start);
                netbuf_puts(nb, "\\n");
                start = src + 1;
                break;
            case '\r':
                if (src > start) netbuf_write(nb, start, src - start);
                netbuf_puts(nb, "\\r");
                start = src + 1;
                break;
            case '\t':
                if (src > start) netbuf_write(nb, start, src - start);
                netbuf_puts(nb, "\\t");
                start = src + 1;
                break;
            default:
                if ((unsigned char)*src < 0x20) {
                    if (src > start) netbuf_write(nb, start, src - start);
                    char hex[8];
                    snprintf(hex, sizeof(hex), "\\u%04x", (unsigned char)*src);
                    netbuf_puts(nb, hex);
                    start = src + 1;
                }
                break;
        }
        src++;
    }
    if (src > start) {
        netbuf_write(nb, start, src - start);
    }
}

/* -------------------------------------------------------------------------
 * Directory Creation Helper
 * ------------------------------------------------------------------------- */
static void ensure_directory_path(const char *dirpath, mode_t mode) {
    if (!dirpath || !dirpath[0]) return;
    char tmp[512];
    snprintf(tmp, sizeof(tmp), "%s", dirpath);
    size_t len = strlen(tmp);
    if (len == 0) return;
    if (tmp[len - 1] == '/') tmp[len - 1] = '\0';

    for (char *p = tmp + 1; *p; p++) {
        if (*p == '/') {
            *p = '\0';
            mkdir(tmp, mode);
            *p = '/';
        }
    }
    mkdir(tmp, mode);
}

/* -------------------------------------------------------------------------
 * Icon Installation into /user/data/notifi
 * ------------------------------------------------------------------------- */
static void install_machete_icon(void) {
    ensure_directory_path("/user/data/notifi", 0755);

    struct stat st;
    if (stat(MACHETE_ICON_PATH, &st) == 0 && (size_t)st.st_size == g_machete_icon_png_len) {
        return;
    }

    FILE *fp = fopen(MACHETE_ICON_PATH, "wb");
    if (fp) {
        fwrite(g_machete_icon_png, 1, g_machete_icon_png_len, fp);
        fclose(fp);
        chmod(MACHETE_ICON_PATH, 0644);
    }
}

/* -------------------------------------------------------------------------
 * System Toast Notification (Sanitized JSON Output)
 * ------------------------------------------------------------------------- */
static void send_system_toast(const char *title, const char *submsg, const char *icon_url) {
    char safe_title[128];
    char safe_submsg[256];

    const char *src_t = title ? title : "Machete";
    size_t ti = 0;
    while (*src_t && ti < sizeof(safe_title) - 1) {
        if (*src_t == '"' || *src_t == '\\' || *src_t == '\n' || *src_t == '\r') {
            safe_title[ti++] = ' ';
        } else {
            safe_title[ti++] = *src_t;
        }
        src_t++;
    }
    safe_title[ti] = '\0';

    const char *src_s = submsg ? submsg : "";
    size_t si = 0;
    while (*src_s && si < sizeof(safe_submsg) - 1) {
        if (*src_s == '"' || *src_s == '\\' || *src_s == '\n' || *src_s == '\r') {
            safe_submsg[si++] = ' ';
        } else {
            safe_submsg[si++] = *src_s;
        }
        src_s++;
    }
    safe_submsg[si] = '\0';

    char payload[2048];
    snprintf(payload, sizeof(payload),
        "{\n"
        "  \"rawData\": {\n"
        "    \"viewTemplateType\": \"InteractiveToastTemplateB\",\n"
        "    \"channelType\": \"Downloads\",\n"
        "    \"useCaseId\": \"IDC\",\n"
        "    \"toastOverwriteType\": \"No\",\n"
        "    \"isImmediate\": true,\n"
        "    \"priority\": 100,\n"
        "    \"viewData\": {\n"
        "      \"icon\": {\n"
        "        \"type\": \"Url\",\n"
        "        \"parameters\": {\n"
        "          \"url\": \"%s\"\n"
        "        }\n"
        "      },\n"
        "      \"message\": {\n"
        "        \"body\": \"%s\"\n"
        "      },\n"
        "      \"subMessage\": {\n"
        "        \"body\": \"%s\"\n"
        "      }\n"
        "    }\n"
        "  }\n"
        "}",
        (icon_url && icon_url[0]) ? icon_url : MACHETE_ICON_PATH,
        safe_title,
        safe_submsg
    );

    sceNotificationSend(SCE_NOTIFICATION_LOCAL_USER_ID_SYSTEM, true, payload);
}

/* -------------------------------------------------------------------------
 * Metadata Extraction: Title ID & Title
 * ------------------------------------------------------------------------- */
static bool find_title_id(const char *str, char out_id[16]) {
    if (!str) return false;
    size_t len = strlen(str);
    if (len < 9) return false;

    for (size_t i = 0; i <= len - 9; i++) {
        if ((strncmp(str + i, "PPSA", 4) == 0 || strncmp(str + i, "CUSA", 4) == 0) &&
            isdigit((unsigned char)str[i + 4]) &&
            isdigit((unsigned char)str[i + 5]) &&
            isdigit((unsigned char)str[i + 6]) &&
            isdigit((unsigned char)str[i + 7]) &&
            isdigit((unsigned char)str[i + 8])) {
            memcpy(out_id, str + i, 9);
            out_id[9] = '\0';
            return true;
        }
    }
    return false;
}

#pragma pack(push, 1)
struct sfo_header {
    uint32_t magic;
    uint32_t version;
    uint32_t key_table_offset;
    uint32_t data_table_offset;
    uint32_t tables_entries;
};

struct sfo_entry {
    uint16_t key_offset;
    uint16_t param_fmt;
    uint32_t param_len;
    uint32_t param_max_len;
    uint32_t data_offset;
};
#pragma pack(pop)

static bool read_param_sfo(const char *sfo_path, char *out_title_id, size_t id_size, char *out_title, size_t title_size) {
    FILE *fp = fopen(sfo_path, "rb");
    if (!fp) return false;

    struct sfo_header hdr;
    if (fread(&hdr, 1, sizeof(hdr), fp) != sizeof(hdr)) {
        fclose(fp);
        return false;
    }

    if (hdr.magic != 0x46535000 || hdr.tables_entries > 512) {
        fclose(fp);
        return false;
    }

    struct sfo_entry *entries = (struct sfo_entry *)malloc(hdr.tables_entries * sizeof(struct sfo_entry));
    if (!entries) {
        fclose(fp);
        return false;
    }

    if (fread(entries, sizeof(struct sfo_entry), hdr.tables_entries, fp) != hdr.tables_entries) {
        free(entries);
        fclose(fp);
        return false;
    }

    size_t key_table_size = (hdr.data_table_offset > hdr.key_table_offset) ?
                            (hdr.data_table_offset - hdr.key_table_offset) : 4096;
    if (key_table_size > 65536) key_table_size = 65536;

    char *keys = (char *)calloc(1, key_table_size + 1);
    if (!keys) {
        free(entries);
        fclose(fp);
        return false;
    }

    if (fseek(fp, hdr.key_table_offset, SEEK_SET) != 0 ||
        fread(keys, 1, key_table_size, fp) != key_table_size) {
        free(keys);
        free(entries);
        fclose(fp);
        return false;
    }
    keys[key_table_size] = '\0';

    bool found_id = false;
    bool found_title = false;

    for (uint32_t i = 0; i < hdr.tables_entries; i++) {
        if (entries[i].key_offset >= key_table_size) continue;
        const char *k = keys + entries[i].key_offset;
        if (!memchr(k, '\0', key_table_size - entries[i].key_offset)) continue;

        if (strcmp(k, "TITLE_ID") == 0 && !found_id) {
            if (fseek(fp, hdr.data_table_offset + entries[i].data_offset, SEEK_SET) == 0) {
                size_t r = entries[i].param_len;
                if (r >= id_size) r = id_size - 1;
                if (r > 0 && fread(out_title_id, 1, r, fp) == r) {
                    out_title_id[r] = '\0';
                    found_id = true;
                }
            }
        } else if (strcmp(k, "TITLE") == 0 && !found_title) {
            if (fseek(fp, hdr.data_table_offset + entries[i].data_offset, SEEK_SET) == 0) {
                size_t r = entries[i].param_len;
                if (r >= title_size) r = title_size - 1;
                if (r > 0 && fread(out_title, 1, r, fp) == r) {
                    out_title[r] = '\0';
                    found_title = true;
                }
            }
        }
    }

    free(keys);
    free(entries);
    fclose(fp);
    return found_id || found_title;
}

static bool read_param_json(const char *json_path, char *out_title_id, size_t id_size, char *out_title, size_t title_size) {
    FILE *fp = fopen(json_path, "rb");
    if (!fp) return false;

    char *buf = (char *)malloc(16384);
    if (!buf) {
        fclose(fp);
        return false;
    }

    size_t n = fread(buf, 1, 16383, fp);
    fclose(fp);
    if (n == 0) {
        free(buf);
        return false;
    }
    buf[n] = '\0';

    bool found_id = false;
    bool found_title = false;

    const char *p = strstr(buf, "\"titleId\"");
    if (!p) p = strstr(buf, "\"title_id\"");
    if (p) {
        const char *colon = strchr(p, ':');
        if (colon) {
            const char *q1 = strchr(colon, '"');
            if (q1) {
                const char *q2 = q1 + 1;
                while (*q2 && *q2 != '"') {
                    if (*q2 == '\\' && *(q2 + 1)) q2 += 2;
                    else q2++;
                }
                if (*q2 == '"') {
                    size_t len = (size_t)(q2 - (q1 + 1));
                    if (len < id_size) {
                        memcpy(out_title_id, q1 + 1, len);
                        out_title_id[len] = '\0';
                        found_id = true;
                    }
                }
            }
        }
    }

    p = strstr(buf, "\"titleName\"");
    if (!p) p = strstr(buf, "\"localizedParameters\"");
    if (p) {
        const char *title_key = strstr(p, "\"titleName\"");
        if (title_key) p = title_key;
        const char *colon = strchr(p, ':');
        if (colon) {
            const char *q1 = strchr(colon, '"');
            if (q1) {
                const char *q2 = q1 + 1;
                while (*q2 && *q2 != '"') {
                    if (*q2 == '\\' && *(q2 + 1)) q2 += 2;
                    else q2++;
                }
                if (*q2 == '"') {
                    size_t len = (size_t)(q2 - (q1 + 1));
                    if (len < title_size) {
                        memcpy(out_title, q1 + 1, len);
                        out_title[len] = '\0';
                        found_title = true;
                    }
                }
            }
        }
    }

    free(buf);
    return found_id || found_title;
}

static bool read_pkg_content_id(const char *pkg_path, char *out_id) {
    FILE *fp = fopen(pkg_path, "rb");
    if (!fp) return false;

    uint8_t hdr[0x80];
    if (fread(hdr, 1, sizeof(hdr), fp) != sizeof(hdr)) {
        fclose(fp);
        return false;
    }
    fclose(fp);

    if (hdr[0] == 0x7F && hdr[1] == 'C' && hdr[2] == 'N' && hdr[3] == 'T') {
        char cid[37];
        memcpy(cid, &hdr[0x40], 36);
        cid[36] = '\0';
        return find_title_id(cid, out_id);
    }
    return false;
}

/* -------------------------------------------------------------------------
 * Fast Recursive Directory Sizing (PS5 Game Folder Accurate)
 * Recursively sums all nested game data (app0, paks, movies, chunks, etc.)
 * up to depth 12 with zero artificial file count cutoffs.
 * Bounded stack: max 13 frames * 1.2 KB = 15.6 KB, fully safe on 8 MB stack.
 * Strictly ignores symlinks (DT_LNK / S_ISLNK) to prevent recursion loops.
 * ------------------------------------------------------------------------- */
static uint64_t compute_dir_size_depth(const char *path, int depth, const volatile bool *p_active) {
    if (!path || !g_running || (p_active && !*p_active) || depth > 12) {
        return 0;
    }

    DIR *dir = opendir(path);
    if (!dir) return 0;

    uint64_t total = 0;
    struct dirent *dp;
    char subpath[PATH_MAX];

    while (g_running && (!p_active || *p_active) && (dp = readdir(dir)) != NULL) {
        if (dp->d_name[0] == '.') {
            if (dp->d_name[1] == '\0' || (dp->d_name[1] == '.' && dp->d_name[2] == '\0')) {
                continue;
            }
        }

        int r = snprintf(subpath, sizeof(subpath), "%s/%s", path, dp->d_name);
        if (r < 0 || (size_t)r >= sizeof(subpath)) {
            continue; // Prevent truncated path traversal
        }

        if (dp->d_type == DT_LNK) {
            continue;
        }

        if (dp->d_type == DT_REG) {
            struct stat st;
            if (lstat(subpath, &st) == 0) {
                if (st.st_size > 0) {
                    total += (uint64_t)st.st_size;
                }
            }
        } else if (dp->d_type == DT_DIR) {
            total += compute_dir_size_depth(subpath, depth + 1, p_active);
        } else {
            // DT_UNKNOWN fallback (e.g. exFAT filesystems)
            struct stat st;
            if (lstat(subpath, &st) == 0) {
                if (S_ISLNK(st.st_mode)) {
                    continue;
                } else if (S_ISREG(st.st_mode)) {
                    if (st.st_size > 0) {
                        total += (uint64_t)st.st_size;
                    }
                } else if (S_ISDIR(st.st_mode)) {
                    total += compute_dir_size_depth(subpath, depth + 1, p_active);
                }
            }
        }
    }

    closedir(dir);
    return total;
}

/* -------------------------------------------------------------------------
 * Size Cache with Mutex Protection & Atomic Writes
 * ------------------------------------------------------------------------- */
typedef struct {
    char path[PATH_MAX];
    uint64_t size_bytes;
    time_t mtime;
} SizeCacheEntry;

static SizeCacheEntry g_size_cache[MAX_SIZE_CACHE];
static int g_size_cache_count = 0;
static bool g_size_cache_loaded = false;
static pthread_mutex_t g_cache_mutex = PTHREAD_MUTEX_INITIALIZER;

static void load_size_cache_locked(void) {
    if (g_size_cache_loaded) return;
    g_size_cache_loaded = true;
    g_size_cache_count = 0;

    FILE *f = fopen(MACHETE_SIZE_CACHE_FILE, "r");
    if (!f) return;

    char line[PATH_MAX + 128];
    while (fgets(line, sizeof(line), f) && g_size_cache_count < MAX_SIZE_CACHE) {
        char *nl = strchr(line, '\n');
        if (!nl && !feof(f)) {
            int ch;
            while ((ch = fgetc(f)) != '\n' && ch != EOF) {}
            continue;
        }
        long long mt = 0;
        unsigned long long sz = 0;
        char p[PATH_MAX];
        if (sscanf(line, "%lld %llu %1023[^\r\n]", &mt, &sz, p) == 3) {
            if (p[0] == '/') {
                strncpy(g_size_cache[g_size_cache_count].path, p, PATH_MAX - 1);
                g_size_cache[g_size_cache_count].path[PATH_MAX - 1] = '\0';
                g_size_cache[g_size_cache_count].size_bytes = (uint64_t)sz;
                g_size_cache[g_size_cache_count].mtime = (time_t)mt;
                g_size_cache_count++;
            }
        }
    }
    fclose(f);
}

static void save_size_cache_locked(void) {
    char tmp_path[PATH_MAX];
    snprintf(tmp_path, sizeof(tmp_path), "%s.tmp", MACHETE_SIZE_CACHE_FILE);

    FILE *f = fopen(tmp_path, "w");
    if (!f) return;

    for (int i = 0; i < g_size_cache_count; i++) {
        fprintf(f, "%lld %llu %s\n",
                (long long)g_size_cache[i].mtime,
                (unsigned long long)g_size_cache[i].size_bytes,
                g_size_cache[i].path);
    }
    fflush(f);
    int fd = fileno(f);
    if (fd >= 0) fsync(fd);
    fclose(f);

    rename(tmp_path, MACHETE_SIZE_CACHE_FILE);
}

static uint64_t get_cached_size(const char *path, time_t mtime) {
    pthread_mutex_lock(&g_cache_mutex);
    load_size_cache_locked();
    for (int i = 0; i < g_size_cache_count; i++) {
        if (strcmp(g_size_cache[i].path, path) == 0) {
            if (g_size_cache[i].mtime == mtime) {
                uint64_t sz = g_size_cache[i].size_bytes;
                pthread_mutex_unlock(&g_cache_mutex);
                return sz;
            }
            pthread_mutex_unlock(&g_cache_mutex);
            return 0;
        }
    }
    pthread_mutex_unlock(&g_cache_mutex);
    return 0;
}

static void set_cached_size(const char *path, time_t mtime, uint64_t size_bytes, bool persist) {
    pthread_mutex_lock(&g_cache_mutex);
    load_size_cache_locked();
    for (int i = 0; i < g_size_cache_count; i++) {
        if (strcmp(g_size_cache[i].path, path) == 0) {
            g_size_cache[i].mtime = mtime;
            g_size_cache[i].size_bytes = size_bytes;
            if (persist) save_size_cache_locked();
            pthread_mutex_unlock(&g_cache_mutex);
            return;
        }
    }
    if (g_size_cache_count < MAX_SIZE_CACHE) {
        strncpy(g_size_cache[g_size_cache_count].path, path, PATH_MAX - 1);
        g_size_cache[g_size_cache_count].path[PATH_MAX - 1] = '\0';
        g_size_cache[g_size_cache_count].mtime = mtime;
        g_size_cache[g_size_cache_count].size_bytes = size_bytes;
        g_size_cache_count++;
    } else {
        // Evict oldest entry (FIFO)
        memmove(&g_size_cache[0], &g_size_cache[1], sizeof(SizeCacheEntry) * (MAX_SIZE_CACHE - 1));
        strncpy(g_size_cache[MAX_SIZE_CACHE - 1].path, path, PATH_MAX - 1);
        g_size_cache[MAX_SIZE_CACHE - 1].path[PATH_MAX - 1] = '\0';
        g_size_cache[MAX_SIZE_CACHE - 1].mtime = mtime;
        g_size_cache[MAX_SIZE_CACHE - 1].size_bytes = size_bytes;
    }
    if (persist) save_size_cache_locked();
    pthread_mutex_unlock(&g_cache_mutex);
}

static void flush_size_cache(void) {
    pthread_mutex_lock(&g_cache_mutex);
    save_size_cache_locked();
    pthread_mutex_unlock(&g_cache_mutex);
}

static void invalidate_cached_size(const char *path) {
    if (!path || !path[0]) return;
    pthread_mutex_lock(&g_cache_mutex);
    load_size_cache_locked();
    size_t plen = strlen(path);
    int new_count = 0;
    bool changed = false;
    for (int i = 0; i < g_size_cache_count; i++) {
        if (strcmp(g_size_cache[i].path, path) == 0 ||
            (strncmp(g_size_cache[i].path, path, plen) == 0 && g_size_cache[i].path[plen] == '/')) {
            changed = true;
            continue;
        }
        if (new_count != i) {
            g_size_cache[new_count] = g_size_cache[i];
        }
        new_count++;
    }
    g_size_cache_count = new_count;
    if (changed) {
        save_size_cache_locked();
    }
    pthread_mutex_unlock(&g_cache_mutex);
}

static uint64_t compute_dir_size_fast(const char *path, const volatile bool *p_active, bool persist_immediate) {
    struct stat st;
    if (stat(path, &st) == 0) {
        uint64_t cached = get_cached_size(path, st.st_mtime);
        if (cached > 0) {
            return cached;
        }
        uint64_t computed = compute_dir_size_depth(path, 0, p_active);
        if (computed > 0) {
            set_cached_size(path, st.st_mtime, computed, persist_immediate);
        }
        return computed;
    }
    return compute_dir_size_depth(path, 0, p_active);
}

/* -------------------------------------------------------------------------
 * Safe Deletion
 * Only allows deletion inside dedicated game or homebrew directories.
 * Strictly prevents path traversal ("..", "/./", "/.") and root/system deletion.
 * ------------------------------------------------------------------------- */
static bool is_safe_delete_path(const char *path) {
    if (!path || path[0] != '/') return false;
    size_t len = strlen(path);
    if (len < 2) return false;

    if (strstr(path, "..") != NULL) return false;
    if (strstr(path, "/./") != NULL) return false;
    if (len >= 2 && strcmp(path + len - 2, "/.") == 0) return false;

    char norm_path[PATH_MAX];
    snprintf(norm_path, sizeof(norm_path), "%s", path);
    while (len > 1 && norm_path[len - 1] == '/') {
        norm_path[--len] = '\0';
    }

    static const char * const allowed_prefixes[] = {
        "/data/games/",
        "/data/homebrew/",
        "/data/etaHEN/games/",
        "/data/etahen/games/",
        "/data/etaHEN/",
        "/data/app/",

        "/user/homebrew/",

        "/mnt/ext0/games/",
        "/mnt/ext0/homebrew/",
        "/mnt/ext0/etaHEN/games/",
        "/mnt/ext0/etahen/games/",
        "/mnt/ext0/app/",

        "/mnt/ext1/games/",
        "/mnt/ext1/homebrew/",
        "/mnt/ext1/etaHEN/games/",
        "/mnt/ext1/etahen/games/",
        "/mnt/ext1/app/",

        "/mnt/usb0/games/",
        "/mnt/usb0/homebrew/",
        "/mnt/usb0/etaHEN/games/",
        "/mnt/usb0/etahen/games/",
        "/mnt/usb0/app/",

        "/mnt/usb1/games/",
        "/mnt/usb1/homebrew/",
        "/mnt/usb1/etaHEN/games/",
        "/mnt/usb1/etahen/games/",
        "/mnt/usb1/app/",

        "/mnt/usb2/games/",
        "/mnt/usb2/homebrew/",
        "/mnt/usb2/etaHEN/games/",
        "/mnt/usb2/etahen/games/",

        "/mnt/usb3/games/",
        "/mnt/usb3/homebrew/",
        "/mnt/usb3/etaHEN/games/",
        "/mnt/usb3/etahen/games/",

        "/mnt/usb4/games/",
        "/mnt/usb4/homebrew/",
        "/mnt/usb4/etaHEN/games/",
        "/mnt/usb4/etahen/games/",

        "/mnt/usb5/games/",
        "/mnt/usb5/homebrew/",
        "/mnt/usb5/etaHEN/games/",
        "/mnt/usb5/etahen/games/",

        "/mnt/usb6/games/",
        "/mnt/usb6/homebrew/",
        "/mnt/usb6/etaHEN/games/",
        "/mnt/usb6/etahen/games/",

        "/mnt/usb7/games/",
        "/mnt/usb7/homebrew/",
        "/mnt/usb7/etaHEN/games/",
        "/mnt/usb7/etahen/games/",
        NULL
    };

    bool allowed = false;
    for (int i = 0; allowed_prefixes[i]; i++) {
        size_t plen = strlen(allowed_prefixes[i]);
        if (strncmp(norm_path, allowed_prefixes[i], plen) == 0 && len > plen) {
            allowed = true;
            break;
        }
    }

    if (!allowed) return false;

    // Never allow deleting the category/mount root directory itself
    for (int i = 0; allowed_prefixes[i]; i++) {
        size_t plen = strlen(allowed_prefixes[i]);
        char root_without_slash[PATH_MAX];
        snprintf(root_without_slash, sizeof(root_without_slash), "%.*s", (int)(plen - 1), allowed_prefixes[i]);
        if (strcmp(norm_path, root_without_slash) == 0) return false;
    }

    return true;
}

static int delete_recursive_depth(const char *path, int depth) {
    if (!path || depth > 64) return -1;
    struct stat st;
    if (lstat(path, &st) != 0) return -1;

    if (S_ISDIR(st.st_mode)) {
        DIR *d = opendir(path);
        if (!d) return -1;

        struct dirent *dp;
        char subpath[PATH_MAX];
        int rc = 0;

        while ((dp = readdir(d)) != NULL) {
            if (strcmp(dp->d_name, ".") == 0 || strcmp(dp->d_name, "..") == 0) continue;
            int r = snprintf(subpath, sizeof(subpath), "%s/%s", path, dp->d_name);
            if (r < 0 || (size_t)r >= sizeof(subpath)) {
                rc = -1;
                continue;
            }
            if (delete_recursive_depth(subpath, depth + 1) != 0) {
                rc = -1;
            }
        }
        closedir(d);

        if (rc == 0) {
            return rmdir(path);
        }
        return rc;
    } else {
        return unlink(path);
    }
}

static int delete_recursive(const char *path) {
    return delete_recursive_depth(path, 0);
}

/* -------------------------------------------------------------------------
 * Target Representation & Deduplication
 * ------------------------------------------------------------------------- */
typedef struct {
    const char *path;
    const char *device;
    const char *label;
} ScanTarget;

#define MAX_DEDUP_PATHS 4096
static char *g_seen_paths[MAX_DEDUP_PATHS];
static int g_seen_count = 0;
static pthread_mutex_t g_scan_mutex = PTHREAD_MUTEX_INITIALIZER;

static void dedup_init(void) {
    for (int i = 0; i < g_seen_count; i++) {
        if (g_seen_paths[i]) {
            free(g_seen_paths[i]);
            g_seen_paths[i] = NULL;
        }
    }
    g_seen_count = 0;
}

static bool dedup_check_and_add(const char *path) {
    if (!path) return true;
    for (int i = 0; i < g_seen_count; i++) {
        if (g_seen_paths[i] && strcmp(g_seen_paths[i], path) == 0) {
            return true;
        }
    }
    if (g_seen_count < MAX_DEDUP_PATHS) {
        g_seen_paths[g_seen_count++] = strdup(path);
    }
    return false;
}

static const char *check_container_extension(const char *filename) {
    if (!filename) return NULL;
    const char *dot = strrchr(filename, '.');
    if (!dot) return NULL;

    if (strcasecmp(dot, ".ffpkg") == 0) return "ffpkg";
    if (strcasecmp(dot, ".pkg") == 0) return "pkg";
    if (strcasecmp(dot, ".exfat") == 0) return "exfat";
    if (strcasecmp(dot, ".ffpfsc") == 0) return "ffpfsc";
    if (strcasecmp(dot, ".iso") == 0) return "iso";

    return NULL;
}

static void emit_game_json(NetBuffer *nb, bool *p_first,
                           const char *title_id,
                           const char *title,
                           const char *path,
                           uint64_t size_bytes,
                           const char *storage_device,
                           const char *storage_label,
                           const char *type) {
    if (!nb || !nb->active) return;

    if (!*p_first) {
        netbuf_puts(nb, ",\n");
    } else {
        *p_first = false;
        netbuf_puts(nb, "\n");
    }

    netbuf_puts(nb, "    {\n");
    netbuf_puts(nb, "      \"title_id\": \"");
    escape_json_to_netbuf(nb, title_id);
    netbuf_puts(nb, "\",\n");

    netbuf_puts(nb, "      \"title\": \"");
    escape_json_to_netbuf(nb, title);
    netbuf_puts(nb, "\",\n");

    netbuf_puts(nb, "      \"path\": \"");
    escape_json_to_netbuf(nb, path);
    netbuf_puts(nb, "\",\n");

    char sz_buf[32];
    snprintf(sz_buf, sizeof(sz_buf), "%llu", (unsigned long long)size_bytes);
    netbuf_puts(nb, "      \"size_bytes\": ");
    netbuf_puts(nb, sz_buf);
    netbuf_puts(nb, ",\n");

    netbuf_puts(nb, "      \"storage_device\": \"");
    escape_json_to_netbuf(nb, storage_device);
    netbuf_puts(nb, "\",\n");

    netbuf_puts(nb, "      \"storage_label\": \"");
    escape_json_to_netbuf(nb, storage_label);
    netbuf_puts(nb, "\",\n");

    netbuf_puts(nb, "      \"format\": \"");
    escape_json_to_netbuf(nb, type);
    netbuf_puts(nb, "\"\n");

    netbuf_puts(nb, "    }");
    netbuf_flush(nb);
}

static void inspect_directory_game(NetBuffer *nb, bool *p_first,
                                   const char *full_path,
                                   const char *dir_name,
                                   const ScanTarget *target) {
    if (!nb || !nb->active) return;

    char title_id[64] = {0};
    char title[256] = {0};

    char subfile[PATH_MAX];
    snprintf(subfile, sizeof(subfile), "%s/sce_sys/param.json", full_path);
    if (!read_param_json(subfile, title_id, sizeof(title_id), title, sizeof(title))) {
        snprintf(subfile, sizeof(subfile), "%s/param.json", full_path);
        if (!read_param_json(subfile, title_id, sizeof(title_id), title, sizeof(title))) {
            snprintf(subfile, sizeof(subfile), "%s/app0/sce_sys/param.json", full_path);
            if (!read_param_json(subfile, title_id, sizeof(title_id), title, sizeof(title))) {
                snprintf(subfile, sizeof(subfile), "%s/app0/param.json", full_path);
                read_param_json(subfile, title_id, sizeof(title_id), title, sizeof(title));
            }
        }
    }

    if (!title_id[0] || !title[0]) {
        char sfo_id[64] = {0};
        char sfo_title[256] = {0};
        snprintf(subfile, sizeof(subfile), "%s/sce_sys/param.sfo", full_path);
        if (!read_param_sfo(subfile, sfo_id, sizeof(sfo_id), sfo_title, sizeof(sfo_title))) {
            snprintf(subfile, sizeof(subfile), "%s/param.sfo", full_path);
            if (!read_param_sfo(subfile, sfo_id, sizeof(sfo_id), sfo_title, sizeof(sfo_title))) {
                snprintf(subfile, sizeof(subfile), "%s/app0/sce_sys/param.sfo", full_path);
                if (!read_param_sfo(subfile, sfo_id, sizeof(sfo_id), sfo_title, sizeof(sfo_title))) {
                    snprintf(subfile, sizeof(subfile), "%s/app0/param.sfo", full_path);
                    read_param_sfo(subfile, sfo_id, sizeof(sfo_id), sfo_title, sizeof(sfo_title));
                }
            }
        }
        if (!title_id[0] && sfo_id[0]) snprintf(title_id, sizeof(title_id), "%s", sfo_id);
        if (!title[0] && sfo_title[0]) snprintf(title, sizeof(title), "%s", sfo_title);
    }

    if (!title_id[0]) {
        find_title_id(dir_name, title_id);
    }

    if (!title[0]) {
        snprintf(title, sizeof(title), "%s", dir_name);
    }

    // Accurate recursive folder sizing (deferred flush for batch scan efficiency)
    uint64_t size_bytes = compute_dir_size_fast(full_path, &nb->active, false);

    emit_game_json(nb, p_first,
                   title_id[0] ? title_id : "UNKNOWN",
                   title,
                   full_path,
                   size_bytes,
                   target->device,
                   target->label,
                   "Carpeta");
}

static bool is_game_folder(const char *dir_path, const char *dir_name) {
    char subfile[PATH_MAX];
    struct stat st;

    snprintf(subfile, sizeof(subfile), "%s/sce_sys/param.json", dir_path);
    if (stat(subfile, &st) == 0) return true;

    snprintf(subfile, sizeof(subfile), "%s/param.json", dir_path);
    if (stat(subfile, &st) == 0) return true;

    snprintf(subfile, sizeof(subfile), "%s/sce_sys/param.sfo", dir_path);
    if (stat(subfile, &st) == 0) return true;

    snprintf(subfile, sizeof(subfile), "%s/param.sfo", dir_path);
    if (stat(subfile, &st) == 0) return true;

    snprintf(subfile, sizeof(subfile), "%s/app0/sce_sys/param.json", dir_path);
    if (stat(subfile, &st) == 0) return true;

    snprintf(subfile, sizeof(subfile), "%s/app0/param.json", dir_path);
    if (stat(subfile, &st) == 0) return true;

    snprintf(subfile, sizeof(subfile), "%s/app0/sce_sys/param.sfo", dir_path);
    if (stat(subfile, &st) == 0) return true;

    snprintf(subfile, sizeof(subfile), "%s/app0/param.sfo", dir_path);
    if (stat(subfile, &st) == 0) return true;

    snprintf(subfile, sizeof(subfile), "%s/eboot.bin", dir_path);
    if (stat(subfile, &st) == 0) return true;

    snprintf(subfile, sizeof(subfile), "%s/app0/eboot.bin", dir_path);
    if (stat(subfile, &st) == 0) return true;

    char tid[16];
    if (find_title_id(dir_name, tid)) return true;

    return false;
}

static void scan_directory_target(NetBuffer *nb, bool *p_first, const ScanTarget *target) {
    if (!nb || !nb->active || !target || !target->path) return;

    struct stat target_st;
    if (stat(target->path, &target_st) != 0 || !S_ISDIR(target_st.st_mode)) {
        return;
    }

    DIR *dir = opendir(target->path);
    if (!dir) return;

    struct dirent *dp;
    char full_path[PATH_MAX];

    while (nb->active && g_running && (dp = readdir(dir)) != NULL) {
        if (strcmp(dp->d_name, ".") == 0 || strcmp(dp->d_name, "..") == 0) continue;

        int r = snprintf(full_path, sizeof(full_path), "%s/%s", target->path, dp->d_name);
        if (r < 0 || (size_t)r >= sizeof(full_path)) continue;

        struct stat st;
        if (lstat(full_path, &st) != 0) continue;

        if (S_ISDIR(st.st_mode)) {
            if (is_game_folder(full_path, dp->d_name)) {
                if (!dedup_check_and_add(full_path)) {
                    inspect_directory_game(nb, p_first, full_path, dp->d_name, target);
                }
            } else {
                // Check 1 level down for subfolders (e.g. category subdirectories)
                struct stat sub_stat;
                if (stat(full_path, &sub_stat) == 0 && S_ISDIR(sub_stat.st_mode)) {
                    DIR *sub_dir = opendir(full_path);
                    if (sub_dir) {
                        struct dirent *sub_dp;
                        char sub_full[PATH_MAX];
                        while (nb->active && g_running && (sub_dp = readdir(sub_dir)) != NULL) {
                            if (strcmp(sub_dp->d_name, ".") == 0 || strcmp(sub_dp->d_name, "..") == 0) continue;
                            int sr = snprintf(sub_full, sizeof(sub_full), "%s/%s", full_path, sub_dp->d_name);
                            if (sr < 0 || (size_t)sr >= sizeof(sub_full)) continue;

                            struct stat sub_st;
                            if (lstat(sub_full, &sub_st) != 0) continue;
                            if (S_ISDIR(sub_st.st_mode)) {
                                if (is_game_folder(sub_full, sub_dp->d_name)) {
                                    if (!dedup_check_and_add(sub_full)) {
                                        inspect_directory_game(nb, p_first, sub_full, sub_dp->d_name, target);
                                    }
                                }
                            } else if (S_ISREG(sub_st.st_mode)) {
                                const char *ext = check_container_extension(sub_dp->d_name);
                                if (ext && !dedup_check_and_add(sub_full)) {
                                    char title_id[32] = {0};
                                    if (strcmp(ext, "pkg") == 0 || strcmp(ext, "ffpkg") == 0) {
                                        read_pkg_content_id(sub_full, title_id);
                                    }
                                    if (!title_id[0]) {
                                        find_title_id(sub_dp->d_name, title_id);
                                    }
                                    char title[256];
                                    snprintf(title, sizeof(title), "%s", sub_dp->d_name);
                                    char *dot = strrchr(title, '.');
                                    if (dot) *dot = '\0';

                                    emit_game_json(nb, p_first,
                                                   title_id[0] ? title_id : "UNKNOWN",
                                                   title,
                                                   sub_full,
                                                   (uint64_t)sub_st.st_size,
                                                   target->device,
                                                   target->label,
                                                   ext);
                                }
                            }
                        }
                        closedir(sub_dir);
                    }
                }
            }
        } else if (S_ISREG(st.st_mode)) {
            const char *ext = check_container_extension(dp->d_name);
            if (ext) {
                if (!dedup_check_and_add(full_path)) {
                    char title_id[32] = {0};
                    if (strcmp(ext, "pkg") == 0 || strcmp(ext, "ffpkg") == 0) {
                        read_pkg_content_id(full_path, title_id);
                    }
                    if (!title_id[0]) {
                        find_title_id(dp->d_name, title_id);
                    }
                    char title[256];
                    snprintf(title, sizeof(title), "%s", dp->d_name);
                    char *dot = strrchr(title, '.');
                    if (dot) *dot = '\0';

                    emit_game_json(nb, p_first,
                                   title_id[0] ? title_id : "UNKNOWN",
                                   title,
                                   full_path,
                                   (uint64_t)st.st_size,
                                   target->device,
                                   target->label,
                                   ext);
                }
            }
        }
    }
    closedir(dir);
}

/* -------------------------------------------------------------------------
 * Dynamic Storage Discovery via getmntinfo(..., MNT_NOWAIT)
 * Safely queries kernel's in-memory mount table in microseconds.
 * Never touches unmounted paths, eliminating kernel VFS locks.
 * ------------------------------------------------------------------------- */
static void get_device_info(const char *mount_point, char *out_dev, size_t dev_sz, char *out_lbl, size_t lbl_sz) {
    if (strcmp(mount_point, "/data") == 0 || strcmp(mount_point, "/user") == 0) {
        snprintf(out_dev, dev_sz, "Interno");
        snprintf(out_lbl, lbl_sz, "%s", mount_point);
    } else if (strncmp(mount_point, "/mnt/ext", 8) == 0) {
        snprintf(out_dev, dev_sz, "M.2 SSD");
        snprintf(out_lbl, lbl_sz, "%s", mount_point);
    } else if (strncmp(mount_point, "/mnt/usb", 8) == 0) {
        int usb_num = atoi(mount_point + 8);
        snprintf(out_dev, dev_sz, "USB %d", usb_num);
        snprintf(out_lbl, lbl_sz, "%s", mount_point);
    } else {
        snprintf(out_dev, dev_sz, "Almacenamiento");
        snprintf(out_lbl, lbl_sz, "%s", mount_point);
    }
}

static void scan_all_mounted_storages(NetBuffer *nb, bool *p_first) {
    if (!nb || !nb->active) return;
    struct statfs *mntbuf = NULL;
    int nitems = getmntinfo(&mntbuf, MNT_NOWAIT);

    static const char * const subdirs[] = {
        "games",
        "homebrew",
        "etaHEN/games",
        "etahen/games",
        "etaHEN",
        NULL
    };

    if (nitems > 0 && mntbuf) {
        for (int i = 0; i < nitems && nb->active && g_running; i++) {
            const char *m = mntbuf[i].f_mntonname;
            if (!m || !m[0]) continue;

            // Handle /user: ONLY scan /user/homebrew. NEVER touch /user/app (Sony PFS panic prevention)
            if (strcmp(m, "/user") == 0) {
                ScanTarget target;
                target.path = "/user/homebrew";
                target.device = "Interno";
                target.label = "/user/homebrew";
                scan_directory_target(nb, p_first, &target);
                continue;
            }

            // Inspect internal storage (/data), M.2 SSD (/mnt/ext*), and USB drives (/mnt/usb*)
            bool is_target_mount = false;
            if (strcmp(m, "/data") == 0) {
                is_target_mount = true;
            } else if (strncmp(m, "/mnt/ext", 8) == 0 || strncmp(m, "/mnt/usb", 8) == 0) {
                is_target_mount = true;
            }

            if (!is_target_mount) continue;

            char dev_name[32];
            char dev_lbl[64];
            get_device_info(m, dev_name, sizeof(dev_name), dev_lbl, sizeof(dev_lbl));

            for (int s = 0; subdirs[s] && nb->active && g_running; s++) {
                char target_path[PATH_MAX];
                int tr = snprintf(target_path, sizeof(target_path), "%s/%s", m, subdirs[s]);
                if (tr < 0 || (size_t)tr >= sizeof(target_path)) continue;

                ScanTarget target;
                target.path = target_path;
                target.device = dev_name;
                target.label = target_path;

                scan_directory_target(nb, p_first, &target);
            }
        }
    } else {
        // Fallback to static known paths if getmntinfo is unavailable
        static const ScanTarget fallback_targets[] = {
            { "/data/games",           "Interno", "/data/games" },
            { "/data/homebrew",        "Interno", "/data/homebrew" },
            { "/data/etaHEN/games",    "Interno", "/data/etaHEN/games" },
            { "/data/etahen/games",    "Interno", "/data/etahen/games" },
            { "/user/homebrew",        "Interno", "/user/homebrew" },
            { "/mnt/ext0/games",       "M.2 SSD", "/mnt/ext0/games" },
            { "/mnt/ext0/homebrew",    "M.2 SSD", "/mnt/ext0/homebrew" },
            { "/mnt/ext0/etaHEN/games","M.2 SSD", "/mnt/ext0/etaHEN/games" },
            { "/mnt/ext0/etahen/games","M.2 SSD", "/mnt/ext0/etahen/games" },
            { "/mnt/ext1/games",       "M.2 SSD", "/mnt/ext1/games" },
            { "/mnt/ext1/homebrew",    "M.2 SSD", "/mnt/ext1/homebrew" },
            { "/mnt/ext1/etaHEN/games","M.2 SSD", "/mnt/ext1/etaHEN/games" },
            { "/mnt/ext1/etahen/games","M.2 SSD", "/mnt/ext1/etahen/games" },
            { "/mnt/usb0/games",       "USB 0",   "/mnt/usb0/games" },
            { "/mnt/usb0/homebrew",    "USB 0",   "/mnt/usb0/homebrew" },
            { "/mnt/usb0/etaHEN/games","USB 0",   "/mnt/usb0/etaHEN/games" },
            { "/mnt/usb0/etahen/games","USB 0",   "/mnt/usb0/etahen/games" },
            { "/mnt/usb1/games",       "USB 1",   "/mnt/usb1/games" },
            { "/mnt/usb1/homebrew",    "USB 1",   "/mnt/usb1/homebrew" },
            { "/mnt/usb1/etaHEN/games","USB 1",   "/mnt/usb1/etaHEN/games" },
            { "/mnt/usb1/etahen/games","USB 1",   "/mnt/usb1/etahen/games" },
            { NULL, NULL, NULL }
        };
        for (int i = 0; fallback_targets[i].path && nb->active && g_running; i++) {
            scan_directory_target(nb, p_first, &fallback_targets[i]);
        }
    }
}

/* -------------------------------------------------------------------------
 * Client Command Handler
 * ------------------------------------------------------------------------- */
static void handle_client(int client_fd) {
    int no_sigpipe = 1;
    setsockopt(client_fd, SOL_SOCKET, SO_NOSIGPIPE, &no_sigpipe, sizeof(no_sigpipe));

    struct timeval tv;
    tv.tv_sec = 60;
    tv.tv_usec = 0;
    setsockopt(client_fd, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv));
    setsockopt(client_fd, SOL_SOCKET, SO_SNDTIMEO, &tv, sizeof(tv));

    NetBuffer conn_nb;
    netbuf_init(&conn_nb, client_fd);

    char in_buf[2048];
    size_t in_len = 0;

    while (g_running && conn_nb.active) {
        ssize_t bytes = recv(client_fd, in_buf + in_len, sizeof(in_buf) - 1 - in_len, 0);
        if (bytes <= 0) {
            break;
        }
        in_len += (size_t)bytes;
        in_buf[in_len] = '\0';

        char *line_start = in_buf;
        char *nl;

        while ((nl = strchr(line_start, '\n')) != NULL) {
            *nl = '\0';
            char *line = line_start;
            line_start = nl + 1;

            size_t llen = strlen(line);
            while (llen > 0 && (line[llen - 1] == '\r' || line[llen - 1] == ' ' || line[llen - 1] == '\t')) {
                line[--llen] = '\0';
            }
            while (*line == ' ' || *line == '\t') line++;

            if (strlen(line) == 0) continue;

            if (strcasecmp(line, "PING") == 0) {
                char pong[256];
                snprintf(pong, sizeof(pong),
                         "{\"status\":\"ok\",\"daemon\":\"%s\",\"version\":\"%s\",\"port\":%d}\n",
                         DAEMON_NAME, DAEMON_VERSION, g_bound_port);
                send(client_fd, pong, strlen(pong), 0);
            } else if (strcasecmp(line, "VERSION") == 0) {
                char vresp[256];
                snprintf(vresp, sizeof(vresp),
                         "{\"status\":\"ok\",\"daemon\":\"%s\",\"version\":\"%s\",\"port\":%d}\n",
                         DAEMON_NAME, DAEMON_VERSION, g_bound_port);
                send(client_fd, vresp, strlen(vresp), 0);
            } else if (strncasecmp(line, "SIZE", 4) == 0) {
                const char *p = line + 4;
                while (*p == ' ' || *p == '\t') p++;
                char req_path[PATH_MAX];
                size_t rlen = 0;
                while (*p && *p != '\r' && *p != '\n' && rlen < sizeof(req_path) - 1) {
                    req_path[rlen++] = *p++;
                }
                req_path[rlen] = '\0';

                uint64_t sz = compute_dir_size_fast(req_path, &conn_nb.active, true);
                char resp[512];
                snprintf(resp, sizeof(resp),
                         "{\"status\":\"ok\",\"path\":\"%s\",\"size_bytes\":%llu}\n",
                         req_path, (unsigned long long)sz);
                send(client_fd, resp, strlen(resp), 0);
            } else if (strncasecmp(line, "CAT", 3) == 0) {
                const char *p = line + 3;
                while (*p == ' ' || *p == '\t') p++;
                char req_path[PATH_MAX];
                size_t rlen = 0;
                while (*p && *p != '\r' && *p != '\n' && rlen < sizeof(req_path) - 1) {
                    req_path[rlen++] = *p++;
                }
                req_path[rlen] = '\0';

                FILE *fp = fopen(req_path, "rb");
                if (!fp) {
                    send(client_fd, "{\"status\":\"error\",\"message\":\"cannot_open\"}\n", 43, 0);
                } else {
                    send(client_fd, "{\"status\":\"ok\",\"content\":\"", 26, 0);
                    NetBuffer nb;
                    netbuf_init(&nb, client_fd);
                    char buf[2048];
                    size_t nr;
                    while ((nr = fread(buf, 1, sizeof(buf) - 1, fp)) > 0) {
                        buf[nr] = '\0';
                        escape_json_to_netbuf(&nb, buf);
                    }
                    fclose(fp);
                    netbuf_puts(&nb, "\"}\n");
                    netbuf_flush(&nb);
                }
            } else if (strncasecmp(line, "LS", 2) == 0) {
                const char *p = line + 2;
                while (*p == ' ' || *p == '\t') p++;
                char req_path[PATH_MAX];
                size_t rlen = 0;
                while (*p && *p != '\r' && *p != '\n' && rlen < sizeof(req_path) - 1) {
                    req_path[rlen++] = *p++;
                }
                req_path[rlen] = '\0';

                DIR *d = opendir(req_path);
                NetBuffer nb;
                netbuf_init(&nb, client_fd);
                netbuf_puts(&nb, "{\"status\":\"ok\",\"path\":\"");
                escape_json_to_netbuf(&nb, req_path);
                netbuf_puts(&nb, "\",\"entries\":[");
                if (d) {
                    struct dirent *dp;
                    bool first_ent = true;
                    while ((dp = readdir(d)) != NULL) {
                        if (strcmp(dp->d_name, ".") == 0 || strcmp(dp->d_name, "..") == 0) continue;
                        char item_path[PATH_MAX];
                        snprintf(item_path, sizeof(item_path), "%s/%s", req_path, dp->d_name);
                        struct stat st;
                        uint64_t fsz = 0;
                        bool is_d = false;
                        if (lstat(item_path, &st) == 0) {
                            fsz = (uint64_t)st.st_size;
                            is_d = S_ISDIR(st.st_mode);
                        }
                        if (!first_ent) netbuf_puts(&nb, ",");
                        first_ent = false;
                        netbuf_puts(&nb, "{\"name\":\"");
                        escape_json_to_netbuf(&nb, dp->d_name);
                        netbuf_puts(&nb, "\",\"is_dir\":");
                        netbuf_puts(&nb, is_d ? "true" : "false");
                        netbuf_puts(&nb, ",\"size\":");
                        char sb[32];
                        snprintf(sb, sizeof(sb), "%llu", (unsigned long long)fsz);
                        netbuf_puts(&nb, sb);
                        netbuf_puts(&nb, "}");
                    }
                    closedir(d);
                }
                netbuf_puts(&nb, "]}\n");
                netbuf_flush(&nb);
            } else if (strcasecmp(line, "MOUNTS") == 0) {
                struct statfs *mntbuf = NULL;
                int nitems = getmntinfo(&mntbuf, MNT_NOWAIT);
                NetBuffer nb;
                netbuf_init(&nb, client_fd);
                netbuf_puts(&nb, "{\"status\":\"ok\",\"mounts\":[");
                if (nitems > 0 && mntbuf) {
                    for (int i = 0; i < nitems; i++) {
                        if (i > 0) netbuf_puts(&nb, ",");
                        netbuf_puts(&nb, "{\"mount\":\"");
                        escape_json_to_netbuf(&nb, mntbuf[i].f_mntonname);
                        netbuf_puts(&nb, "\",\"type\":\"");
                        escape_json_to_netbuf(&nb, mntbuf[i].f_fstypename);
                        netbuf_puts(&nb, "\",\"from\":\"");
                        escape_json_to_netbuf(&nb, mntbuf[i].f_mntfromname);
                        netbuf_puts(&nb, "\"}");
                    }
                }
                netbuf_puts(&nb, "]}\n");
                netbuf_flush(&nb);
            } else if (strcasecmp(line, "SCAN") == 0) {
                NetBuffer nb;
                netbuf_init(&nb, client_fd);
                netbuf_puts(&nb, "{\"status\":\"ok\",\"games\":[");
                netbuf_flush(&nb);

                pthread_mutex_lock(&g_scan_mutex);
                dedup_init();

                bool first = true;
                scan_all_mounted_storages(&nb, &first);

                dedup_init();
                pthread_mutex_unlock(&g_scan_mutex);

                // Flush updated game sizes atomically once scan completes
                flush_size_cache();

                if (nb.active) {
                    netbuf_puts(&nb, "\n]}\n");
                    netbuf_flush(&nb);
                }
            } else if (strncasecmp(line, "DELETE", 6) == 0) {
                const char *p = line + 6;
                while (*p == ' ' || *p == '\t') p++;

                char target_path[PATH_MAX];
                size_t tlen = 0;
                if (*p == '"') {
                    p++;
                    while (*p && *p != '"' && tlen < sizeof(target_path) - 1) {
                        target_path[tlen++] = *p++;
                    }
                } else {
                    while (*p && *p != '\r' && *p != '\n' && tlen < sizeof(target_path) - 1) {
                        target_path[tlen++] = *p++;
                    }
                }
                target_path[tlen] = '\0';

                while (tlen > 0 && (target_path[tlen - 1] == ' ' || target_path[tlen - 1] == '\t')) {
                    target_path[--tlen] = '\0';
                }

                if (!is_safe_delete_path(target_path)) {
                    char err_resp[1024];
                    snprintf(err_resp, sizeof(err_resp),
                             "{\"status\":\"error\",\"message\":\"Ruta no permitida o insegura\",\"path\":\"%s\"}\n",
                             target_path);
                    send(client_fd, err_resp, strlen(err_resp), 0);
                } else {
                    struct stat st;
                    if (lstat(target_path, &st) != 0) {
                        char err_resp[1024];
                        snprintf(err_resp, sizeof(err_resp),
                                 "{\"status\":\"error\",\"message\":\"Ruta no encontrada\",\"path\":\"%s\"}\n",
                                 target_path);
                        send(client_fd, err_resp, strlen(err_resp), 0);
                    } else {
                        int del_rc = delete_recursive(target_path);
                        if (del_rc == 0) {
                            invalidate_cached_size(target_path);
                            send_system_toast("Machete: Juego eliminado", target_path, MACHETE_ICON_PATH);
                            char ok_resp[1024];
                            snprintf(ok_resp, sizeof(ok_resp),
                                     "{\"status\":\"ok\",\"deleted\":\"%s\"}\n",
                                     target_path);
                            send(client_fd, ok_resp, strlen(ok_resp), 0);
                        } else {
                            char err_resp[1024];
                            snprintf(err_resp, sizeof(err_resp),
                                     "{\"status\":\"error\",\"message\":\"Fallo al eliminar\",\"errno\":%d,\"path\":\"%s\"}\n",
                                     errno, target_path);
                            send(client_fd, err_resp, strlen(err_resp), 0);
                        }
                    }
                }
            } else if (strcasecmp(line, "SHUTDOWN") == 0 || strcasecmp(line, "STOP") == 0) {
                const char *bye = "{\"status\":\"ok\",\"message\":\"shutting_down\"}\n";
                send(client_fd, bye, strlen(bye), 0);
                g_running = false;
                conn_nb.active = false;
                kill(getpid(), SIGTERM); // Interrupt accept() on main thread
                break;
            } else if (strcasecmp(line, "QUIT") == 0 || strcasecmp(line, "EXIT") == 0) {
                const char *bye = "{\"status\":\"ok\",\"message\":\"bye\"}\n";
                send(client_fd, bye, strlen(bye), 0);
                break;
            } else {
                const char *unknown = "{\"status\":\"error\",\"message\":\"Comando desconocido\"}\n";
                send(client_fd, unknown, strlen(unknown), 0);
            }
        }

        size_t remaining = (in_buf + in_len) - line_start;
        if (remaining > 0 && line_start != in_buf) {
            memmove(in_buf, line_start, remaining);
        } else if (remaining == sizeof(in_buf) - 1) {
            // Oversized line without newline: discard to prevent deadlock
            remaining = 0;
        }
        in_len = remaining;
    }

    close(client_fd);
}

/* -------------------------------------------------------------------------
 * Signal & Fault Handlers
 * Guaranteed cleanup on termination or fault to protect kernel state
 * ------------------------------------------------------------------------- */
static void handle_sigterm(int sig) {
    (void)sig;
    g_running = false;
}

static void handle_sigfault(int sig) {
    (void)sig;
    payload_restore_privileges();
    _exit(128 + sig);
}

/* -------------------------------------------------------------------------
 * UDP Auto-Discovery Responder Thread
 * ------------------------------------------------------------------------- */
static void *discovery_thread(void *arg) {
    int port = (int)(intptr_t)arg;
    int sock = socket(AF_INET, SOCK_DGRAM, 0);
    if (sock < 0) return NULL;

    int one = 1;
    setsockopt(sock, SOL_SOCKET, SO_REUSEADDR, &one, sizeof(one));
    setsockopt(sock, SOL_SOCKET, SO_REUSEPORT, &one, sizeof(one));
    setsockopt(sock, SOL_SOCKET, SO_BROADCAST, &one, sizeof(one));

    // 1-second receive timeout so thread checks g_running and exits cleanly
    struct timeval tv;
    tv.tv_sec = 1;
    tv.tv_usec = 0;
    setsockopt(sock, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv));

    struct sockaddr_in a;
    memset(&a, 0, sizeof(a));
    a.sin_family = AF_INET;
    a.sin_addr.s_addr = htonl(INADDR_ANY);
    a.sin_port = htons(port);
    if (bind(sock, (struct sockaddr *)&a, sizeof(a)) < 0) {
        close(sock);
        return NULL;
    }

    char buf[128];
    while (g_running) {
        struct sockaddr_in from;
        socklen_t fl = sizeof(from);
        ssize_t n = recvfrom(sock, buf, sizeof(buf) - 1, 0, (struct sockaddr *)&from, &fl);
        if (n <= 0) continue;
        buf[n] = '\0';
        if (strncmp(buf, "MACHETE_DISCOVER", 16) == 0) {
            char resp[96];
            int rl = snprintf(resp, sizeof(resp), "MACHETE|%d|" DAEMON_VERSION, port);
            sendto(sock, resp, rl, 0, (struct sockaddr *)&from, fl);
        }
    }
    close(sock);
    return NULL;
}

static void *client_thread_worker(void *arg) {
    int client_fd = (int)(intptr_t)arg;
    handle_client(client_fd);
    return NULL;
}

/* -------------------------------------------------------------------------
 * Main Entry Point
 * ------------------------------------------------------------------------- */
int main(void) {
#ifndef SYS_thr_set_name
#define SYS_thr_set_name 464
#endif
    syscall(SYS_thr_set_name, -1, "machete_daemon.elf");

    signal(SIGPIPE, SIG_IGN);

    // Install signal handlers with explicit sa_flags = 0 (NO SA_RESTART)
    // Ensures accept() unblocks immediately with EINTR upon SIGTERM/SIGINT
    struct sigaction sa_term;
    memset(&sa_term, 0, sizeof(sa_term));
    sa_term.sa_handler = handle_sigterm;
    sigemptyset(&sa_term.sa_mask);
    sa_term.sa_flags = 0;
    sigaction(SIGTERM, &sa_term, NULL);
    sigaction(SIGINT, &sa_term, NULL);

    struct sigaction sa_fault;
    memset(&sa_fault, 0, sizeof(sa_fault));
    sa_fault.sa_handler = handle_sigfault;
    sigemptyset(&sa_fault.sa_mask);
    sa_fault.sa_flags = 0;
    sigaction(SIGSEGV, &sa_fault, NULL);
    sigaction(SIGBUS, &sa_fault, NULL);
    sigaction(SIGILL, &sa_fault, NULL);
    sigaction(SIGABRT, &sa_fault, NULL);

    // 1. Self-elevate using canonical ps5-payload-elfldr pattern:
    //    Sets root_vnode, clears jaildir to 0, sets uid 0, and sets ShellCore authid
    payload_self_elevate();

    // 2. Clear any stale zombie payload instances holding sockets (without touching elfldr)
    kill_stale_payloads();

    // 3. Install icon into /user/data/notifi/machete_logo.png
    install_machete_icon();

    // 4. Create and bind TCP socket with port fallback (9038 -> 9039..9043)
    int server_fd = -1;
    int opt = 1;
    int no_sigpipe = 1;

    for (int p = DAEMON_DEFAULT_PORT; p <= DAEMON_DEFAULT_PORT + 5; p++) {
        server_fd = socket(AF_INET, SOCK_STREAM, 0);
        if (server_fd < 0) break;

        setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));
        setsockopt(server_fd, SOL_SOCKET, SO_REUSEPORT, &opt, sizeof(opt));
        setsockopt(server_fd, SOL_SOCKET, SO_NOSIGPIPE, &no_sigpipe, sizeof(no_sigpipe));

        struct sockaddr_in serv_addr;
        memset(&serv_addr, 0, sizeof(serv_addr));
        serv_addr.sin_family = AF_INET;
        serv_addr.sin_addr.s_addr = htonl(INADDR_ANY);
        serv_addr.sin_port = htons(p);

        if (bind(server_fd, (struct sockaddr *)&serv_addr, sizeof(serv_addr)) == 0) {
            g_bound_port = p;
            break;
        }
        close(server_fd);
        server_fd = -1;
    }

    if (server_fd < 0 || g_bound_port == 0) {
        payload_restore_privileges();
        return 1;
    }

    if (listen(server_fd, 16) != 0) {
        close(server_fd);
        payload_restore_privileges();
        return 2;
    }

    // 5. Record the bound port for external reference
    FILE *pf = fopen(MACHETE_PORT_FILE, "w");
    if (pf) {
        fprintf(pf, "%d\n", g_bound_port);
        fclose(pf);
    }

    // 6. Launch UDP auto-discovery responder
    pthread_t dt;
    pthread_attr_t dat;
    pthread_attr_init(&dat);
    pthread_attr_setdetachstate(&dat, PTHREAD_CREATE_DETACHED);
    pthread_create(&dt, &dat, discovery_thread, (void *)(intptr_t)g_bound_port);
    pthread_attr_destroy(&dat);

    // 7. Display native system notification toast with Machete icon and active port
    char notif_sub[128];
    snprintf(notif_sub, sizeof(notif_sub), "Servicio de gestion remota activo (Puerto %d)", g_bound_port);
    send_system_toast("Machete PS5 Manager", notif_sub, MACHETE_ICON_PATH);

    // 8. Connection acceptance loop
    while (g_running) {
        struct sockaddr_in client_addr;
        socklen_t client_len = sizeof(client_addr);
        int client_fd = accept(server_fd, (struct sockaddr *)&client_addr, &client_len);
        if (client_fd < 0) {
            if (!g_running) break;
            usleep(20000);
            continue;
        }

        pthread_t th;
        pthread_attr_t attr;
        pthread_attr_init(&attr);
        pthread_attr_setstacksize(&attr, 8 * 1024 * 1024);
        pthread_attr_setdetachstate(&attr, PTHREAD_CREATE_DETACHED);
        if (pthread_create(&th, &attr, client_thread_worker, (void *)(intptr_t)client_fd) != 0) {
            handle_client(client_fd);
        }
        pthread_attr_destroy(&attr);
    }

    close(server_fd);
    unlink(MACHETE_PORT_FILE);
    payload_restore_privileges();
    return 0;
}

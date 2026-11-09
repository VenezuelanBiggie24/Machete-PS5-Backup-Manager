# Machete PS5 Remote Management Daemon Makefile
# Native PlayStation 5 C Payload (prospero-clang)

PS5_PAYLOAD_SDK ?= /Users/thebigmike/.gemini/antigravity/scratch/MacheteSVG/.deps/native/ps5-payload-sdk

include $(PS5_PAYLOAD_SDK)/toolchain/prospero.mk

TARGET := machete_daemon.elf
SRCS := machete_daemon.c

CFLAGS := -Wall -Wextra -O2 -g -lSceNotification
LDFLAGS :=

all: $(TARGET)

$(TARGET): $(SRCS)
	PATH="/opt/homebrew/opt/llvm/bin:$(PATH)" LLVM_CONFIG=/opt/homebrew/opt/llvm/bin/llvm-config $(CC) $(CFLAGS) -o $@ $^ $(LDFLAGS)
	PATH="/opt/homebrew/opt/llvm/bin:$(PATH)" LLVM_CONFIG=/opt/homebrew/opt/llvm/bin/llvm-config $(STRIP) --strip-unneeded $@

clean:
	rm -f $(TARGET)

.PHONY: all clean

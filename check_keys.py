import json

def get_keys(filename):
    with open(filename, 'r') as f:
        data = json.load(f)
    return set(data.keys())

en_keys = get_keys('src/locales/en.json')
es_ve_keys = get_keys('src/locales/es_ve.json')
ja_keys = get_keys('src/locales/ja.json')

print("Missing in EN:")
print(es_ve_keys - en_keys)
print("Missing in JA:")
print(es_ve_keys - ja_keys)

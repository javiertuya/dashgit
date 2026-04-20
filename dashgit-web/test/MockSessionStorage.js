export function createMockSessionStorage() {
  return {
    items: {},
    setItem(key, value) {
      this.items[key] = String(value)
    },
    getItem(key) {
      return this.items[key] ?? null
    },
    removeItem(key) {
      delete this.items[key]
    },
    clear() {
      this.items = {}
    },
    get length() {
      return Object.keys(this.items).length
    },
    key(n) {
      return Object.keys(this.items)[n] ?? null
    },
    log() {
      console.log(this.items);
    }
  }
}
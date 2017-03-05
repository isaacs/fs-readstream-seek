const t = require('tap')
const fs = require('fs')
const path = require('path')
const file = path.join(__dirname, 'file')

return t.pass('skip')

try {
  fs.unlinkSync(file)
} catch (er) {
  if (er.code !== 'ENOENT')
    throw er
}
t.pass('removed file')

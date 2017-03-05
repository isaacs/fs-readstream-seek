const t = require('tap')
const fs = require('fs')
const path = require('path')
const file = path.join(__dirname, 'file')
const chars = 'abcdefghijklmnopqrstuvwxyz'.split('')
const blocksize = 1024

try {
  if (fs.statSync(file).size === blocksize * 26) {
    t.plan(0, 'file already exists')
    process.exit(0)
  }
} catch (er) {}

const stream = fs.createWriteStream(file)
stream.on('close', _=> {
  t.equal(fs.statSync(file).size, blocksize * 26)
  t.end()
})


const write =_=> {
  for (let c = chars.shift(); c; c = chars.shift()) {
    if (!stream.write(makeBlock(c)))
      return stream.once('drain', write)
  }
  stream.end()
}

const makeBlock = c => new Buffer(new Array(blocksize).join(c) + '\n')

write()

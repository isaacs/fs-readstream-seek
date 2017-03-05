const Seeker = require('../')
const fs = require('fs')
const Reader = fs.ReadStream
const t = require('tap')
const path = require('path')
const file = path.join(__dirname, 'file')

const accumStream = stream => {
  let data = ''
  stream.on('data', chunk => data += chunk)
  return new Promise(resolve => {
    stream.on('end', _=> resolve(data))
  })
}

const read = (stream, n) => {
  return new Promise(resolve => {
    const data = stream.read(n)
    if (data)
      resolve(data + '')
    else
      stream.once('readable', _ => resolve(stream.read(n) + ''))
  })
}

const event = (obj, ev) => new Promise(resolve => obj.once(ev, resolve))

t.test('read straight through', async t => {
  const s = new Seeker(file)
  const f = new Reader(file)
  const [fdata, sdata] = await Promise.all([
    accumStream(s),
    accumStream(f)
  ])
  t.equal(sdata, fdata, 'got same data')
})

t.test('jump around', async t => {
  const s = new Seeker(file)
  t.equal(await read(s, 10), 'aaaaaaaaaa', 'a{10} at pos 0')
  t.equal(s.readPos, 10)
  s.seek(0)
  t.equal(s.readPos, 0)
  t.equal(s.filePos, 0)
  s.seek(0)
  s.seek(0)
  s.seek(0)
  t.match(await read(s, 1024), /^a{1023}\n$/)
  s.seek(1023)
  t.equal(await read(s, 10), '\nbbbbbbbbb', '\\nb* at pos 1023')
  s.seek(1024*10 - 5)
  t.match(await read(s, 1024), /j{4}\nk{1019}$/)
  s.seek(1024 * 25 - 2)
  t.equal(await read(s, 10), 'y\nzzzzzzzz')
  s.seek(16245)
  t.match(await read(s, 1024), /p{138}\nq{885}/)
})

t.test('end again and again', async t => {
  const s = new Seeker(file)
  let ended = 0
  s.on('end', _ => ended ++)

  s.seek(26 * 1024 - 256)
  t.match(await read(s), /^z{255}\n$/)
  t.equal(await read(s), 'null')
  t.equal(ended, 1)

  s.seek(26 * 1024 - 256)
  t.match(await read(s), /^z{255}\n$/)
  t.equal(await read(s), 'null')
  t.equal(ended, 2)

  s.seek(26 * 1024 - 256)
  t.match(await read(s), /^z{255}\n$/)
  t.equal(await read(s), 'null')
  t.equal(ended, 3)
})

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
      stream.once('readable', _ => {
        const data = stream.read(n)
        if (data)
          resolve(data + '')
        else
          resolve(null)
      })
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

t.test('hop around', async t => {
  const s = new Seeker(file, { highWaterMark: 4 * 1024, lowWaterMark: 1024 })
  t.equal(await read(s, 10), 'aaaaaaaaaa', 'a{10} at pos 0')
  t.equal(s.readPos, 10)
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

t.test('baby steps', t => {
  const steps = [1, 10, 128, 37, 25 * 1024, 64 * 1024]
  t.plan(steps.length)
  t.jobs = steps.length
  const expect = fs.readFileSync(file, 'utf8')
  steps.forEach(step => {
    t.test('step=' + step, async t => {
      // set an end and a different hwm here to flush out more coverage
      const s = new Seeker(file, { highWaterMark: step, end: 26 * 1024 })
      let data = ''
      let n = 0
      let chunk
      let ended = false
      s.on('end', _ => ended = true)
      while (chunk = await read(s)) {
        data += chunk.substr(0, step)
        n += Math.min(chunk.length, step)
        s.seek(n)
      }
      t.equal(data, expect)
    })
  })
})

t.test('end again and again', async t => {
  const s = new Seeker(file)
  let ended = 0
  s.on('end', _ => ended ++)

  s.seek(26 * 1024 - 256)
  t.match(await read(s), /^z{255}\n$/)
  t.equal(await read(s), null)
  t.equal(ended, 1)

  s.seek(26 * 1024 - 256)
  t.match(await read(s), /^z{255}\n$/)
  t.equal(await read(s), null)
  t.equal(ended, 2)

  s.seek(26 * 1024 - 256)
  t.match(await read(s), /^z{255}\n$/)
  t.equal(await read(s), null)
  t.equal(ended, 3)
})

t.test('weird steps with a short-returning fs.read', t => {
  const fsRead = fs.read
  t.tearDown(_ => fs.read = fsRead)
  fs.read = (fd, buf, offset, length, position, cb) =>
    fsRead(fd, buf, offset, length, position,
           (er, bytesRead) => cb(er, Math.min(bytesRead || 0, 1024)))

  const s = new Seeker(file)
  const int = setInterval(async _ => {
    if (s._readableState.buffer.length >= 16) {
      clearInterval(int)
      s.seek(1024 * 10)
      t.match(await read(s, 1024), /^k{1023}\n$/)
      t.end()
    }
  }, 100)
})

t.test('walk up to the end', async t => {
  const s = new Seeker(file, { end: 1023, start: 0 })
  let ended = false
  s.once('end', _ => ended = true)
  s.seek(1023)
  t.equal(await read(s, 1), '\n')
  t.equal(s.read(), null)
  return event(s, 'end')
})

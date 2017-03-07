const Seeker = require('../')
const fs = require('fs')
const t = require('tap')
const path = require('path')
const file = path.join(__dirname, 'file')

t.test('multiple times', t => {
  const s = new Seeker(file)
  t.plan(7)
  s.once('open', fd => s.open())
  s.open(_ => t.pass('open cb'))
  s.open()
  s.open(_ => t.pass('open cb'))
  s.once('open', fd => {
    t.isa(fd, 'number')
    s.open(_ => t.pass('open cb with fd'))
    s.close( _ => t.pass('close cb'))
    s.destroy()
    s.close( _ => t.pass('close cb'))
    s.once('close', _ => {
      s.close( _ => t.pass('close cb after close'))
      s.open()
    })
  })
})

t.test('close while opening', t => {
  const s = new Seeker(file)
  s.close(t.end)
})

t.test('wrong types', async t => {
  t.throws(_ => {
    const s = new Seeker(file, { start: {} })
  })
})

t.test('fs.open error emits error', t => {
  const fsOpen = fs.open
  fs.open = (path, flags, mode, cb) =>
    process.nextTick(_ => cb(new Error('whooooops')))

  t.teardown(_ => fs.open = fsOpen)

  const s = new Seeker(file)
  s.once('error', er => {
    t.isa(er, Error)
    t.match(er, { message: /^who+ps$/ })
    t.end()
  })
})

t.test('fs.read error emits error', t => {
  const fsRead = fs.read
  fs.read = (fd, buf, offset, length, position, cb) =>
    process.nextTick(_ => cb(new Error('whooooops')))

  t.teardown(_ => fs.read = fsRead)

  const s = new Seeker(file)
  s.once('error', er => {
    t.isa(er, Error)
    t.match(er, { message: /^who+ps$/ })
    t.end()
  })
})

t.test('fs.close error emits error', t => {
  const fsClose = fs.close
  fs.close = (fd, cb) => {
    fsClose(fd, _=>_)
    process.nextTick(_ => cb(new Error('whooooops')))
  }

  t.tearDown(_ => fs.close = fsClose)

  const s = new Seeker(file)
  s.resume()
  s.once('error', er => {
    t.isa(er, Error)
    t.match(er, { message: /^who+ps$/ })
    t.end()
  })
})

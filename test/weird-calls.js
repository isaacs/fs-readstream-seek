const Seeker = require('../')
const fs = require('fs')
const t = require('tap')
const path = require('path')
const file = path.join(__dirname, 'file')

t.test('multiple times', t => {
  const s = new Seeker(file)
  t.plan(7)
  s.open(_ => t.pass('open cb'))
  s.open(_ => t.pass('open cb'))
  s.on('open', fd => {
    t.isa(fd, 'number')
    s.open(_ => t.pass('open cb with fd'))
    s.close( _ => t.pass('close cb'))
    s.close( _ => t.pass('close cb'))
    s.on('close', _ => s.close( _ => t.pass('close cb after close')))
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

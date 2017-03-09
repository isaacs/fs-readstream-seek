var Seeker = require('../')
var assert = require('assert')

const assertLength = rs => {
  const length = rs.length
  let blength = 0
  let bl = rs.buffer
  if (Array.isArray(bl)) {
    blength = bl.map(b => b.length).reduce((a, b) => a + b)
  } else {
    for (let b = bl.head; b; b = b.next) {
      blength += b.data.length
    }
  }
  assert.equal(blength, length)
}

const assertPos = s => {
  assertLength(s._readableState)
  assert.equal(s.readPos + s._readableState.length, s.filePos)
}

const methods = [ 'seek', 'read', '_read', 'push' ]
const proto = Object.create(null)
methods.forEach(method => {
  proto[method] = Seeker.prototype[method]
  Seeker.prototype[method] = function () {
    let threw = true
    try {
      assertPos(this)
      threw = false
    } finally {
      if (threw)
        console.error('failed before %s', method, this._readableState)
    }
    const ret = proto[method].apply(this, arguments)
    threw = true
    try {
      assertPos(this)
      threw = false
    } finally {
      if (threw)
        console.error('failed after %s', method, this._readableState)
    }
    return ret
  }
})

require('./basic.js')

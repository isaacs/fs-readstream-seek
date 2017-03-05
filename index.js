'use strict'
const fs = require('fs')
const assert = require('assert')
const Readable = require('stream').Readable

const POOL = Symbol('pool')
const READING = Symbol('reading')
const OPENING = Symbol('opening')
const CLOSING = Symbol('closing')

const kMinPoolSpace = 128
const kMaxLength = require('buffer').kMaxLength

const allocNewPool = poolSize => {
  ReadStream[POOL] = Buffer.allocUnsafe(poolSize)
  ReadStream[POOL].used = 0
}

class ReadStream extends Readable {
  constructor (path, options) {
    super(options)
    this.path = path
    setOpts(this, options, {
      fd: null,
      flags: 'r',
      autoClose: true,
      mode: 0o666,
      start: 0,
      end: Infinity
    })

    checkType(this.start, 'number', '"start" option must be a Number')
    checkType(this.end, 'number', '"end" option must be a Number')
    assert(this.end > this.start, '"start" option must be <= "end"')
    this.filePos = this.readPos = this.start
    this[READING] = null
    this[OPENING] = false
    this[CLOSING] = false
    this.read(0)
  }

  emit (ev, data) {
    if ((ev === 'end' || ev === 'error') && this.autoClose)
      this.close()
    return Readable.prototype.emit.apply(this, arguments)
  }

  open (cb) {
    if (this[OPENING])
      return cb ? this.once('open', cb) : null

    if (this[CLOSING])
      return this.once('close', _ => this.open(cb))

    if (typeof this.fd === 'number')
      return cb ? process.nextTick(cb) : null

    this[OPENING] = true

    if (cb)
      this.once('open', fd => cb(null, fd))

    fs.open(this.path, this.flags, this.mode, (er, fd) => {
      this[OPENING] = false

      if (er)
        return this.emit('error', er)

      this.fd = fd
      this.emit('open', fd)
      // start the flow of data.
      this.read(0)
    })
  }

  _read (n) {
    if (typeof this.fd !== 'number')
      return this.open(_ => this._read(n))

    assert.equal(this[READING], null, 'Error: already reading')

    if (!ReadStream[POOL] ||
        ReadStream[POOL].length - ReadStream[POOL].used < kMinPoolSpace) {
      // discard the old pool.
      allocNewPool(this._readableState.highWaterMark)
    }

    // Grab another reference to the pool in the case that while we're
    // in the thread pool another read() finishes up the pool, and
    // allocates a new one.
    const thisPool = ReadStream[POOL]
    const toRead = Math.min(this.end - this.filePos + 1,
      Math.min(thisPool.length - thisPool.used, n))
    const start = thisPool.used

    // already read everything we were supposed to read!
    // treat as EOF.
    if (toRead <= 0)
      return this.push(null)

    const onread = (er, bytesRead) => {
      const readingStart = this[READING]
      this[READING] = null

      if (er)
        return this.emit('error', er)

      // short-circuit EOF

      const end = readingStart + bytesRead
      const diff = readingStart - this.filePos

      // if we hit EOF, and haven't seeked to somewhere else, then end
      if (bytesRead <= 0 && diff === 0)
        return this.push(null)

      // if there was no seek mid-read, then diff=0
      // otherwise:
      // 1. either we sought backwards, or past the end,
      // and need to restart, or
      // 2. or we sought within the read, do a partial push
      // Note that if both diff and bytesRead are zero, then
      if (diff < 0 || diff >= bytesRead)
        return this._read(n)

      this.filePos += bytesRead - diff
      this.push(thisPool.slice(start + diff, start + bytesRead - diff))
    }

    // the actual read.
    this[READING] = this.filePos
    fs.read(this.fd, thisPool, thisPool.used, toRead, this.filePos, onread)

    thisPool.used += toRead
  }

  read (n) {
    var ret = Readable.prototype.read.apply(this, arguments)
    if (ret)
      this.readPos += ret.length
    return ret
  }

  seek (pos) {
    assert(pos >= this.start, 'cannot seek before "start" option')
    assert(pos <= this.end, 'cannot seek past "end" option')
    if (pos === this.readPos)
      return

    if (this._readableState.length) {
      const bl = this._readableState.buffer
      if (pos > this.readPos && pos < this.filePos - 128) {
        // i want to go to there
        const diff = pos - this.readPos
        trimBufferList(bl, diff)
        this._readableState.length -= diff
      } else {
        // can't get there from here
        bl.length = 0
        if (!Array.isArray(bl))
          bl.head = bl.tail = null
        this._readableState.length = 0
        this.filePos = pos
      }
    } else
      // just set our sights on where we want to be
      this.filePos = pos

    this._readableState.needReadable = true
    this._readableState.ended = false
    this._readableState.endEmitted = false
    this.readPos = pos
  }

  destroy () {
    this.close()
  }

  close (cb) {
    if (this[OPENING])
      return this.once('open', _ => this.close(cb))

    if (this[CLOSING])
      return cb ? this.once('close', cb) : null

    if (this.fd === null)
      return cb ? process.nextTick(cb) : null

    this[CLOSING] = true

    if (cb)
      this.once('close', cb)

    fs.close(this.fd, er => {
      this[CLOSING] = false
      /* istanbul ignore if */
      if (er)
        this.emit('error', er)
      else
        this.emit('close')
    })

    this.fd = null
  }
}

const checkType = (field, type, msg) => {
  if (typeof field !== type)
    throw new TypeError(msg)
}

const setOpts = (self, options, defaults) =>
  Object.keys(defaults).forEach(key =>
    setOpt(self, options || defaults, key, defaults[key]))

const setOpt = (self, options, field, def) =>
  self[field] = optCheck(options, field, def)

const optCheck = (options, field, def) =>
  options[field] === undefined ? def : options[field]

const trimBufferList = (bl, diff) => {
  while (bl.length) {
    let b = bl.shift()
    let n = b.length
    if (n >= diff) {
      b = b.slice(diff)
      bl.unshift(b)
      return
    }
    diff -= n
  }
}


module.exports = ReadStream

'use strict'
const fs = require('fs')
const assert = require('assert')
const Readable = require('stream').Readable

const POOL = Symbol('pool')
const READING = Symbol('reading')
const OPENING = Symbol('opening')
const CLOSING = Symbol('closing')
const FPOS = Symbol('filePos')
const RPOS = Symbol('readPos')

const kMinPoolSpace = 128

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
    assert(this.start <= this.end, '"start" option must be <= "end"')
    this[FPOS] = this[RPOS] = this.start
    this[READING] = null
    this[OPENING] = false
    this[CLOSING] = false
    this.read(0)
  }

  get readPos () {
    return this[RPOS]
  }

  get filePos () {
    return this[FPOS]
  }

  emit (ev, data) {
    if ((ev === 'end' || ev === 'error') && this.autoClose)
      this.close()

    // update readPos on any data event.
    // Note that 'data' events are also emitted when read() returns data
    if (ev === 'data')
      this[RPOS] += data.length

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
    const toRead = Math.min(this.end - this[FPOS] + 1,
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

      const diff = this[FPOS] - readingStart

      // if we hit EOF, and haven't seeked to somewhere else, then end
      if (bytesRead <= 0 && diff === 0)
        return this.push(null)

      // if there was no seek mid-read, then diff=0
      // otherwise:
      // 1. either we sought backwards, or past the end,
      // and need to restart, or
      // 2. or we sought within the read, do a partial push
      if (diff < 0 || diff >= bytesRead)
        return this._read(n)

      this.push(thisPool.slice(start + diff, start + bytesRead + diff))
    }

    // the actual read.
    this[READING] = this[FPOS]
    fs.read(this.fd, thisPool, thisPool.used, toRead, this[FPOS], onread)

    thisPool.used += toRead
  }

  push (buf) {
    if (buf)
      this[FPOS] += buf.length
    return Readable.prototype.push.apply(this, arguments)
  }

  seek (pos) {
    assert(pos >= this.start, 'cannot seek before "start" option')
    assert(pos <= this.end, 'cannot seek past "end" option')
    if (pos === this[RPOS])
      return

    if (this._readableState.length) {
      const bl = this._readableState.buffer
      const diff = pos - this[RPOS]
      if (diff > 0 && this._readableState.length - diff > 128) {
        // i want to go to there
        const garbageChunk = Readable.prototype.read.call(this, diff)
        assert(garbageChunk)
        assert(garbageChunk.length === diff)
      } else {
        // can't get there from here
        bl.length = 0

        // this has no effect on node <7, but is required in >=7
        bl.head = bl.tail = null

        this._readableState.length = 0
        this[FPOS] = pos
      }
    } else
      // just set our sights on where we want to be
      this[FPOS] = pos

    this._readableState.ended = false
    this._readableState.endEmitted = false
    this[RPOS] = pos
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

module.exports = ReadStream

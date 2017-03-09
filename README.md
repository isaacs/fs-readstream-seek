# fs-readstream-seek

A
[fs.ReadStream](https://nodejs.org/api/fs.html#fs_class_fs_readstream)
that supports seeking to arbtrary locations within a file.

[![Build
Status](https://travis-ci.org/isaacs/fs-readstream-seek.svg?branch=master)](https://travis-ci.org/isaacs/fs-readstream-seek)

Note that this stream is _only_ appropriate for files where positioned
reads are supported.  For abstract filesystem objects where you wish
to do ordered asynhronous reads without specifying position (for
example, FIFO devices), use `fs.ReadStream` instead.

## USAGE

```js
const ReadStream = require('fs-readstream-seek')
const s = new ReadStream('some-filename.db')
s.seek(123)
s.once('data', chunk => {
  console.log('the data at position 123 is %s', chunk)
})
```

## API

Everything on `fs.ReadStream` is supported, plus:

* `stream.seek(n)` Seek to a position in the file.  If the position is
  within the portion of the file that has already been read into
  memory, no new read is triggered, and the in-memory buffer is
  updated.  If the position is beyond the end of the buffer, or before
  the beginning of the buffer, then the buffer is discarded a new
  `fs.read()` is made at the apporpriate location.

* `stream.readPos` Read-only indication of where in the file the next
  `read()` will occur at.  This is always updated when
  `stream.seek(n)` is called.

    Note that this is _not_ the position where
    the current buffer in a `'data'` event was found, but rather the
    position where the _next_ data chunk will be read from.  You can,
    however, get that value by subtracting the chunk length from the
    `stream.readPos` value.

    ```javascript
    stream.on('data', chunk => {
      console.error('position=%d data=%j',
        stream.readPos - chunk.length,
        chunk.toString())
    })
    ```

* `stream.filePos` Read-only indication of where the read buffer is
  currently filled up to, and thus where the next `fs.read()` will
  occur within the file.  This may be updated by `stream.seek(n)`, if
  necessary, and will naturally increase as more data is pulled into
  the buffer.

## Caveat re Stream Conventions

By convention, when a `Readable` stream emits an 'end' event, it is an
indication that no more data will be made available.  Thus `'end'` is
always a single-time event per-stream.  Likewise, `close` and `open`
events on `fs` streams are generally unique in the lifetime of a
stream.

However, when you seek to a new location within a file, it resets the
`EOF` handling.  If the end of the file was read into the buffer, and
thus automatically closed, then it will be re-opened if necessary when
your program calls `stream.seek(n)`.

So you can do this to read a file and print to stdout repeatedly:

```js
const ReadStream = require('fs-readstream-seek')
const s = new ReadStream('some-filename.txt')
s.on('end', _ => {
  s.seek(0)
})
s.on('data', c => {
  process.stdout.write(c)
})
```

In this case, `end` will be emitted every time the stream gets to the
end of the data.  When `s.seek(0)` is called, the file is re-opened
and starts reading from the beginning again.

Because it's a very common convention, `'end'` and `'close'` events
cause a `readable.pipe(writable)` chain to be disassembled.  If this
is a thing that your program will be triggering by seek()-ing
backwards in the file after it has emitted `'end'`, then you are
strongly advised _not_ to `pipe()` that data anywhere, and instead
consume it directly using `'data'` events or `read()` method calls.

# fs-readstream-seek

A
[fs.ReadStream](https://nodejs.org/api/fs.html#fs_class_fs_readstream)
that supports seeking to arbtrary locations within a file.

[![Build
Status](https://travis-ci.org/isaacs/fs-readstream-seek.svg?branch=master)](https://travis-ci.org/isaacs/fs-readstream-seek)

## USAGE

```js
const Seeker = require('fs-readstream-seek')
const s = new Seeker('some-filename.db')
s.seek(123)
s.once('data', chunk => {
  console.log('the data at position 123 is %s', chunk)
})
```

When you seek to a new location within a file, it resets the `EOF`
handling, so you can do this to read a file repeatedly:

```js
const Seeker = require('fs-readstream-seek')
const s = new Seeker('some-filename.txt')
s.on('end', _ => {
  s.seek(0)
})
s.on('data', c => {
  process.stdout.write(c)
})
```

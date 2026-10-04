# Scribble word list

`enable1.txt` is ENABLE (Enhanced North American Benchmark LExicon), a public-domain English word list. Scribble's server accepts a play only if every word it forms is on this list.

- Source: <https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt>
- Words: 172,823 (lowercase, one per line, LF)
- SHA-256: `3f16130220645692ed49c7134e24a18504c2ca55b3c012f7290e3e77c63b1a89`

ENABLE was released into the public domain by its authors and may be redistributed freely. Do not replace it with NASPA (NWL), Collins, or any other copyrighted list.

`test/rules/dictionary.test.ts` pins the checksum, so any edit to the list has to be deliberate.

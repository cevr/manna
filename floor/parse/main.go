// The Go floor of manna's Parse (M1): the least work a query's parse needs,
// one pass over its bytes with no allocation. It trims the white space,
// reads the numbers and separators from the right, lower-cases the book part
// into a stack buffer and looks it up in the alias table. It stands for a
// lower bound, not a second parser: loose spellings (prefix search, a space
// after a leading digit) are left out. Input: the recorded queries
// (ergo/bible/testdata/parse-42.tsv) on stdin; output: how many name a book.
package main

import (
	_ "embed"
	"bufio"
	"fmt"
	"os"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"
)

//go:embed aliases.txt
var aliasText string

func main() {
	aliases := map[string]int{}
	for _, line := range strings.Split(strings.TrimSpace(aliasText), "\n") {
		name, n, _ := strings.Cut(line, "\t")
		aliases[name], _ = strconv.Atoi(n)
	}
	in := bufio.NewScanner(os.Stdin)
	in.Buffer(make([]byte, 1<<16), 1<<20)
	found := 0
	for in.Scan() {
		query, _, _ := strings.Cut(in.Text(), "\t")
		if parse(query, aliases) > 0 {
			found++
		}
	}
	fmt.Println(found)
}

// parse is the book a query names, 0 for none.
func parse(q string, aliases map[string]int) int {
	q = strings.TrimFunc(q, unicode.IsSpace)
	end := len(q)
	// Numbers and separators from the right.
	for end > 0 {
		c := q[end-1]
		if c >= '0' && c <= '9' || c == ':' || c == '-' || c == ' ' {
			end--
			continue
		}
		break
	}
	var buf [64]byte
	n := 0
	for i := 0; i < end; {
		r, size := utf8.DecodeRuneInString(q[i:])
		i += size
		r = unicode.ToLower(r)
		if n+utf8.RuneLen(r) > len(buf) {
			return 0
		}
		n += utf8.EncodeRune(buf[n:], r)
	}
	return aliases[string(buf[:n])]
}

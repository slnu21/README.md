// 주석을 허용하는 JSON(JSONC) 전처리. 순수 — DOM 없이 테스트한다(lib/jsonc.test.ts).
//
// 왜 필요한가: 사용자 테마 파일은 **파일 자체가 설명서**다. 어떤 키가 무엇을 칠하는지,
// 값 규칙이 무엇인지는 주석으로 파일 안에 적어 두는 게 별도 문서보다 훨씬 잘 읽힌다.
//
// **왜 지우지 않고 공백으로 바꾸나**: JSON.parse 는 오류 위치를 문자 오프셋으로 준다.
// 주석을 지워 버리면 그 오프셋이 원본의 엉뚱한 자리를 가리켜 "12번째 줄" 안내가 거짓말이 된다.
// 길이를 보존하면 오프셋이 그대로 맞는다 — 줄바꿈도 남겨야 하므로 \n 은 건드리지 않는다.
//
// 트레일링 콤마는 **지원하지 않는다**(주석 제거만으로는 안 되고, 값 파싱을 직접 해야 한다).
// 템플릿 머리말에 그렇게 적어 둔다.

/** `//`·`/* *\/` 주석을 같은 길이의 공백으로 바꾼다. 문자열 리터럴 안은 건드리지 않는다. */
export function stripJsonComments(text: string): string {
  const out = text.split("");
  let i = 0;
  let inString = false;
  const blank = (from: number, to: number): void => {
    for (let k = from; k < to; k++) if (out[k] !== "\n") out[k] = " ";
  };
  while (i < text.length) {
    const c = text[i];
    if (inString) {
      // 이스케이프는 두 글자를 통째로 건너뛴다 — `"\\"` 뒤의 따옴표가 문자열을 닫는 것이 맞다.
      if (c === "\\") {
        i += 2;
        continue;
      }
      if (c === '"') inString = false;
      i++;
      continue;
    }
    if (c === '"') {
      inString = true;
      i++;
      continue;
    }
    if (c === "/" && text[i + 1] === "/") {
      const nl = text.indexOf("\n", i);
      const end = nl === -1 ? text.length : nl;
      blank(i, end);
      i = end;
      continue;
    }
    if (c === "/" && text[i + 1] === "*") {
      const close = text.indexOf("*/", i + 2);
      // 닫히지 않은 블록 주석은 끝까지 주석으로 본다(무한 루프도, 남은 내용의 오독도 없다).
      const end = close === -1 ? text.length : close + 2;
      blank(i, end);
      i = end;
      continue;
    }
    i++;
  }
  return out.join("");
}

/** 문자 오프셋 → 1부터 세는 줄·칸. JSON.parse 오류 메시지를 사람 말로 옮길 때 쓴다. */
export function offsetToLineCol(text: string, offset: number): { line: number; col: number } {
  const at = Math.max(0, Math.min(offset, text.length));
  let line = 1;
  let last = -1;
  for (let i = 0; i < at; i++) {
    if (text[i] === "\n") {
      line++;
      last = i;
    }
  }
  return { line, col: at - last };
}

/** JSON.parse 오류 메시지에서 위치를 뽑아 "N번째 줄" 형태로 만든다.
 *  V8 은 "... at position 123 (line 5 column 3)" 또는 "... at position 123" 을 준다 —
 *  엔진 문구에 기대지 않으려고 position 만 읽어 우리가 직접 센다. 못 찾으면 null. */
export function parseErrorLine(text: string, err: unknown): number | null {
  const msg = err instanceof Error ? err.message : String(err);
  const m = /position (\d+)/.exec(msg);
  if (!m) return null;
  return offsetToLineCol(text, Number(m[1])).line;
}

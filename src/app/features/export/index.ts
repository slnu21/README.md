// Export: HTML(자기완결: CSS·이미지·폰트 인라인) / PDF(OS 인쇄 대화상자 경유).
// 참고: docs/design/features/export.md
import { saveFile, writeFile } from "../../lib/tauri";
import { buildExportHtml, type ExportParams } from "./html";
import { printHtmlToPdf } from "./pdf";

export type ExportFormat = "html" | "pdf";
export type { ExportParams } from "./html";

// 인쇄용: 카드 테두리/그림자 제거 + 여백을 페이지 여백에 위임(내용이 종이를 꽉 채우게).
const PRINT_CSS =
  "@page{margin:16mm}@media print{body{background:#fff;padding:0}" +
  ".md{border:none;box-shadow:none;border-radius:0;padding:0}}";

/** 활성 문서 제목(파일명)의 확장자를 교체. */
function withExt(name: string, ext: string): string {
  return name.replace(/\.[^.\\/]*$/, "") + "." + ext;
}

/** 자기완결 HTML로 내보내기(저장 대화상자 → 쓰기). 취소 시 아무 것도 안 함. */
export async function exportHtml(params: ExportParams, baseName: string): Promise<void> {
  const html = await buildExportHtml(params);
  const path = await saveFile(withExt(baseName, "html"), [
    { name: "HTML", extensions: ["html"] },
  ]);
  if (!path) return;
  await writeFile(path, html);
}

/** PDF로 내보내기(인쇄 대화상자 → 'PDF로 저장'). */
export async function exportToPdf(params: ExportParams): Promise<void> {
  const html = await buildExportHtml(params, PRINT_CSS);
  printHtmlToPdf(html);
}

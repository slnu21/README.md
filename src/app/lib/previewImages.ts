// 미리보기/프레젠테이션 공용: 로컬 이미지 src를 Tauri asset URL로 재작성.
// 문서 폴더 기준 상대경로 해석. 원격/데이터/asset URL은 그대로 둔다.
import { convertFileSrc } from "@tauri-apps/api/core";

export function dirOf(path: string): string {
  const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return i >= 0 ? path.slice(0, i) : "";
}

function joinPath(dir: string, rel: string): string {
  // 절대 경로(드라이브/슬래시 시작)는 그대로, 상대 경로는 문서 폴더 기준.
  if (/^[a-zA-Z]:[\\/]/.test(rel) || rel.startsWith("/") || rel.startsWith("\\")) return rel;
  const clean = rel.replace(/^\.[\\/]/, "");
  return dir ? `${dir}/${clean}` : clean;
}

/** 로컬(상대/절대 파일) 이미지 src → Tauri asset URL. 원격/데이터 URL은 그대로. */
export function rewriteImages(html: string, fileDir: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("img").forEach((img) => {
    const src = img.getAttribute("src") ?? "";
    if (!src || /^(https?:|data:|blob:|asset:)/i.test(src)) return;
    try {
      img.setAttribute("src", convertFileSrc(joinPath(fileDir, src)));
    } catch {
      /* 변환 실패 시 원본 유지 */
    }
  });
  return doc.body.innerHTML;
}

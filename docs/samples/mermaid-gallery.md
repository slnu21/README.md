# Mermaid 갤러리 · Mermaid Gallery

> 회귀 검증용 샘플 — 모든 다이어그램이 렌더되어야 정상. / Regression fixture — every diagram must render.
> mermaid 11 문법 기준. 하나라도 "mermaid render error" 또는 빈 블록이면 버그.

## 1. Flowchart

```mermaid
flowchart TD
    A[시작] --> B{조건?}
    B -->|예| C[처리 A]
    B -->|아니오| D[처리 B]
    C --> E[(DB 저장)]
    D --> E
    E --> F[종료]
```

## 2. ER Diagram

```mermaid
erDiagram
    CUSTOMER ||--o{ ORDER : places
    ORDER ||--|{ LINE_ITEM : contains
    CUSTOMER {
        string name
        string email
        int age
    }
    ORDER {
        int id
        date created_at
        float total
    }
    LINE_ITEM {
        int qty
        float price
    }
```

## 3. Sequence Diagram

```mermaid
sequenceDiagram
    participant U as 사용자
    participant A as 앱
    participant R as Rust
    U->>A: 파일 열기
    A->>R: read_file(path)
    R-->>A: 내용
    A-->>U: 미리보기 표시
```

## 4. Class Diagram

```mermaid
classDiagram
    class Editor {
        +string content
        +open(path) void
        +save() bool
    }
    class Preview {
        +render(md) string
    }
    Editor --> Preview : updates
    Editor <|-- MarkdownEditor
```

## 5. State Diagram (v2)

```mermaid
stateDiagram-v2
    [*] --> Idle
    Idle --> Loading : open
    Loading --> Ready : loaded
    Loading --> Error : fail
    Ready --> Editing : type
    Editing --> Ready : save
    Error --> Idle : retry
    Ready --> [*] : close
```

## 6. Gantt

```mermaid
gantt
    title 릴리스 일정
    dateFormat YYYY-MM-DD
    section 설계
    아키텍처       :done,    des1, 2026-06-01, 5d
    데이터모델     :done,    des2, after des1, 3d
    section 구현
    에디터         :active,  imp1, 2026-06-10, 7d
    미리보기       :         imp2, after imp1, 5d
```

## 7. Pie

```mermaid
pie title 언어 비중
    "TypeScript" : 55
    "Rust" : 30
    "CSS" : 15
```

## 8. Git Graph

```mermaid
gitGraph
    commit
    branch develop
    checkout develop
    commit
    commit
    checkout main
    merge develop
    commit
```

## 9. User Journey

```mermaid
journey
    title 문서 편집 여정
    section 열기
      파일 선택: 5: 사용자
      로딩: 3: 앱
    section 편집
      작성: 4: 사용자
      저장: 5: 사용자, 앱
```

## 10. Mindmap

```mermaid
mindmap
  root((README.md))
    리더
      라이트박스
      프레젠테이션
    에디터
      서식 단축키
      자동 목록
    워크스페이스
      가상 폴더
      전역 검색
```

## 11. Timeline

```mermaid
timeline
    title 버전 히스토리
    v0.1 : MVP
    v0.2 : 리치 미리보기
    v0.3 : 편집 UX
    v0.4 : 워크스페이스 재구성
    v0.5 : 내보내기 · 파일연결
    v0.6 : 명령 팔레트 · 전역 찾기
```

## 12. Quadrant Chart

```mermaid
quadrantChart
    title 기능 우선순위
    x-axis 낮은 노력 --> 높은 노력
    y-axis 낮은 가치 --> 높은 가치
    quadrant-1 지금
    quadrant-2 계획
    quadrant-3 보류
    quadrant-4 빠른 성과
    mermaid 수정: [0.3, 0.9]
    파일연결: [0.25, 0.75]
    DnD 개선: [0.4, 0.6]
```

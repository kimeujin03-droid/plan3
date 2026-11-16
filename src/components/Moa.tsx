import { useEffect, useRef, useState, type ReactNode } from 'react';

/** 눈만으로 짓는 표정. 이름은 레퍼런스 시트의 상태 이름을 따른다. */
export type MoaMood =
  | 'idle' // 기본(대기)
  | 'smile' // 웃음, 휴식
  | 'excited' // 신남·반가움, 할 일 완료
  | 'focus' // 집중
  | 'think' // 생각 중
  | 'sleep' // 졸림, 수면
  | 'tired' // 피곤함
  | 'surprised' // 놀람, 알림
  | 'heart' // 좋아함, 쓰다듬을 때
  | 'cheer'; // 응원·화이팅

const EYE = '#F7F3FF';
const L = 72;
const R = 128;
const CY = 94;

const both = (draw: (cx: number) => ReactNode) => (
  <>
    {draw(L)}
    {draw(R)}
  </>
);

const stroke = { fill: 'none', stroke: EYE, strokeWidth: 6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

function eyes(mood: MoaMood): ReactNode {
  switch (mood) {
    case 'smile':
    case 'excited':
      return both((cx) => <path key={cx} d={`M${cx - 11},${CY + 5} Q${cx},${CY - 14} ${cx + 11},${CY + 5}`} {...stroke} />);
    case 'focus':
      return both((cx) => <rect key={cx} x={cx - 11} y={CY - 3} width="22" height="6" rx="3" fill={EYE} />);
    case 'sleep':
      return both((cx) => <rect key={cx} x={cx - 10} y={CY + 6} width="20" height="5" rx="2.5" fill={EYE} />);
    case 'tired':
      return both((cx) => <path key={cx} d={`M${cx - 11},${CY - 1} Q${cx},${CY + 15} ${cx + 11},${CY - 1} Z`} fill={EYE} />);
    case 'surprised':
      return both((cx) => <ellipse key={cx} cx={cx} cy={CY} rx="8" ry="12" {...stroke} strokeWidth={5} />);
    case 'heart':
      return both((cx) => (
        <path
          key={cx}
          d={`M${cx},${CY + 11} C${cx - 16},${CY - 1} ${cx - 10},${CY - 14} ${cx},${CY - 5} C${cx + 10},${CY - 14} ${cx + 16},${CY - 1} ${cx},${CY + 11} Z`}
          fill={EYE}
        />
      ));
    case 'cheer':
      return (
        <>
          <path d={`M${L - 8},${CY - 10} L${L + 8},${CY} L${L - 8},${CY + 10}`} {...stroke} />
          <path d={`M${R + 8},${CY - 10} L${R - 8},${CY} L${R + 8},${CY + 10}`} {...stroke} />
        </>
      );
    default:
      return both((cx) => <rect key={cx} x={cx - 8} y={CY - 14} width="16" height="28" rx="8" fill={EYE} />);
  }
}

/** 눈 옆에 붙는 작은 효과: 반짝임, zZ, 느낌표, 말줄임표. */
function extras(mood: MoaMood): ReactNode {
  const text = { fill: EYE, fontSize: 15, fontWeight: 700, fontFamily: 'Jua, sans-serif' };
  switch (mood) {
    case 'excited':
      return (
        <g stroke={EYE} strokeWidth="3" strokeLinecap="round">
          <line x1="148" y1="70" x2="153" y2="62" />
          <line x1="155" y1="76" x2="162" y2="72" />
          <line x1="52" y1="70" x2="47" y2="62" />
        </g>
      );
    case 'sleep':
      return (
        <text x="140" y="80" {...text} className="moa-zz">
          zZ
        </text>
      );
    case 'surprised':
      return (
        <text x="150" y="82" {...text} fontSize={18}>
          !
        </text>
      );
    case 'think':
      return (
        <g fill={EYE} className="moa-dots">
          <circle cx="142" cy="116" r="2.5" />
          <circle cx="150" cy="116" r="2.5" />
          <circle cx="158" cy="116" r="2.5" />
        </g>
      );
    case 'heart':
      return <path d="M152,74 C146,69 148,63 152,67 C156,63 158,69 152,74 Z" fill={EYE} className="moa-pop" />;
    case 'idle':
      // 시트의 작은 볼 빗금
      return (
        <g stroke={EYE} strokeWidth="2.5" strokeLinecap="round" opacity="0.7">
          <line x1="54" y1="116" x2="57" y2="111" />
          <line x1="60" y1="116" x2="63" y2="111" />
          <line x1="137" y1="116" x2="140" y2="111" />
          <line x1="143" y1="116" x2="146" y2="111" />
        </g>
      );
    default:
      return null;
  }
}

interface Props {
  /** 가로 크기(px) */
  size?: number;
  mood?: MoaMood;
  /** 쓰다듬을 수 있는지. 쓰다듬으면 잠깐 하트 눈이 된다. */
  pettable?: boolean;
  /** 옆에 다는 별 키링 */
  charm?: boolean;
}

const LABEL: Record<MoaMood, string> = {
  idle: '모아',
  smile: '웃는 모아',
  excited: '신난 모아',
  focus: '집중하는 모아',
  think: '생각하는 모아',
  sleep: '자는 모아',
  tired: '피곤한 모아',
  surprised: '놀란 모아',
  heart: '좋아하는 모아',
  cheer: '응원하는 모아',
};

export function Moa({ size = 160, mood = 'idle', pettable = false, charm = false }: Props) {
  const [petted, setPetted] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);

  const pet = () => {
    if (!pettable) return;
    setPetted(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setPetted(false), 1300);
  };

  const shown: MoaMood = petted ? 'heart' : mood;
  return (
    <svg
      className={`moa${pettable ? ' pettable' : ''}${petted ? ' petted' : ''}`}
      width={size}
      height={(size * 176) / 200}
      viewBox="0 0 200 176"
      role="img"
      aria-label={pettable ? `${LABEL[shown]}. 쓰다듬을 수 있어요` : LABEL[shown]}
      onPointerDown={pet}
      onPointerMove={(e) => {
        if (e.pointerType === 'mouse' && e.buttons === 0) return;
        pet();
      }}
    >
      {charm && (
        <g className="moa-charm">
          <circle cx="22" cy="104" r="6" fill="none" stroke="#B7ADE6" strokeWidth="3" />
          <path d="M22,112 L27,123 L39,124 L30,132 L33,144 L22,138 L11,144 L14,132 L5,124 L17,123 Z" fill="#AFC0FF" stroke="#8FA3F2" strokeWidth="2" strokeLinejoin="round" />
        </g>
      )}
      <g className="moa-bob">
        <path d="M38,44 L46,8 Q49,2 55,7 L84,30 Z" fill="#CFC6F3" />
        <path d="M162,44 L154,8 Q151,2 145,7 L116,30 Z" fill="#CFC6F3" />
        <path d="M49,34 L52,16 L67,30 Z" fill="#E7E0FB" />
        <path d="M151,34 L148,16 L133,30 Z" fill="#E7E0FB" />
        <rect x="14" y="30" width="172" height="140" rx="62" fill="#B3A7E6" />
        <rect x="14" y="22" width="172" height="140" rx="62" fill="#CFC6F3" />
        <rect x="32" y="46" width="136" height="96" rx="42" fill="#17132A" />
        <rect x="32" y="46" width="136" height="96" rx="42" fill="none" stroke="#3A3261" strokeWidth="2" />
        <g className={shown === 'idle' ? 'moa-eyes blink' : 'moa-eyes'}>{eyes(shown)}</g>
        {extras(shown)}
      </g>
    </svg>
  );
}

interface Props {
  /** 글자 크기(px)가 곧 모아의 크기 단위. 16이면 첫 화면용 큰 모아. */
  size?: number;
  closed?: boolean;
  bob?: boolean;
  mini?: boolean;
}

export function Moa({ size = 16, closed = false, bob = false, mini = false }: Props) {
  const cls = ['moa', closed ? 'closed' : '', bob ? 'bob' : '', mini ? 'mini' : ''].filter(Boolean).join(' ');
  return (
    <div className={cls} style={{ fontSize: size }} role="img" aria-label={closed ? '눈 감은 모아' : '모아'}>
      <div className="moa-body">
        <div className="moa-screen">
          <div className="moa-eyes">
            <div className="moa-eye" />
            <div className="moa-eye" />
          </div>
          <div className="moa-mouth" />
        </div>
      </div>
      <div className="moa-foot" />
    </div>
  );
}

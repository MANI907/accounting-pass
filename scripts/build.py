"""Build a dependency-free study site from uploaded Markdown sources."""
from pathlib import Path
import re, json, html
from html.parser import HTMLParser

ROOT=Path(__file__).resolve().parents[1]
class SafeHTML(HTMLParser):
    def __init__(self): super().__init__(); self.out=[]
    def handle_starttag(self,tag,attrs):
        if tag in {'table','thead','tbody','tr','th','td','br','u','b','strong','em','p','sub','sup'}:
            a=''.join(' '+k+'="'+html.escape(v,quote=True)+'"' for k,v in attrs if k in {'colspan','rowspan'} and v and v.isdigit())
            self.out.append('<'+tag+a+'>')
    def handle_endtag(self,tag):
        if tag in {'table','thead','tbody','tr','th','td','u','b','strong','em','p','sub','sup'}: self.out.append('</'+tag+'>')
    def handle_data(self,data): self.out.append(html.escape(data))

def render(text):
    out=[]; rows=[]
    def flush():
        if rows:
            out.append('<div class="table-scroll"><table>'+''.join(rows)+'</table></div>');rows.clear()
    for line in text.splitlines():
        if line.strip().startswith('|'):
            cells=line.strip().strip('|').split('|')
            if all(re.fullmatch(r'\s*:?-+:?\s*',c) for c in cells):continue
            rows.append('<tr>'+''.join('<td>'+c.strip()+'</td>' for c in cells)+'</tr>')
        else:
            flush()
            if line.strip().startswith(('<table','<tr','</table','</tr','<thead','<tbody')):out.append(line)
            elif line.strip():out.append('<p>'+line.removeprefix('- ').replace('\\~','~')+'</p>')
    flush(); p=SafeHTML();p.feed('\n'.join(out));return ''.join(p.out)

TOPICS=[
('영세율·면세','부가가치세',r'영세율|면세포기|면세', '영세율은 과세거래에 0%를 적용하므로 관련 매입세액을 공제·환급할 수 있습니다. 면세거래 관련 매입세액은 원칙적으로 공제하지 않습니다. 면세포기는 법정 대상과 절차에 한해 가능합니다.'),
('공급시기','부가가치세',r'공급시기|공급 시기|공급하는 시기','재화는 원칙적으로 인도되거나 이용 가능하게 되는 때, 용역은 역무 제공이 완료되는 때가 공급시기입니다. 중간지급조건부·장기할부 등 특례는 거래 조건을 따로 확인하세요.'),
('세금계산서·증빙','부가가치세',r'세금계산서|영수증|계산서합계표','세금계산서의 필요적 기재사항은 공급자 등록번호와 성명·명칭, 공급받는 자 등록번호, 공급가액과 부가가치세액, 작성연월일입니다. 수정 발급은 사유별 작성일자를 구분하세요.'),
('매입세액·납부세액','부가가치세',r'매입세액|납부세액|대손세액','납부세액의 기본 구조는 매출세액 − 공제 가능한 매입세액입니다. 면세사업 관련, 사업 무관 등 불공제 항목을 먼저 구분하세요.'),
('과세표준·매출세액','부가가치세',r'부가가치세|공급가액|공급대가','부가세 포함 대가와 공급가액을 구분하세요. 10% 과세거래의 부가세 포함액은 1.1로 나누어 공급가액을 계산합니다. 에누리·환입 등 과세표준 차감 항목도 확인하세요.'),
('원천징수','소득세',r'원천징수','예납적 원천징수는 확정신고에서 기납부세액으로 정산하고, 완납적 원천징수는 해당 소득의 납세의무가 종결됩니다.'),
('근로·퇴직소득','소득세',r'근로소득|퇴직소득|연말정산','급여 총액과 과세대상 근로소득은 다릅니다. 비과세소득을 제외한 후 근로소득공제, 소득공제, 세액공제를 순서대로 구분하세요.'),
('종합소득·소득구분','소득세',r'소득세|종합소득|이자소득|배당소득|사업소득|기타소득|연금소득','소득 종류를 먼저 판정하고 종합과세·분리과세 여부를 확인하세요. 총수입금액, 필요경비, 소득금액을 혼동하지 않는 것이 핵심입니다.'),
('기업업무추진비·기부금','법인세',r'기업업무추진비|기부금','지출의 성격을 구분한 뒤 손금 한도를 계산합니다. 기업업무추진비는 기본한도와 수입금액 기준 한도, 기부금은 종류별 한도와 이월 규정을 확인하세요.'),
('세무조정·소득처분','법인세',r'세무조정|소득처분|유보|손금불산입|익금불산입','회계상 당기순이익에서 익금산입·손금불산입을 더하고 손금산입·익금불산입을 뺍니다. 사외유출 여부와 귀속자를 확인해 소득처분을 판단하세요.'),
('법인세 계산·신고','법인세',r'법인세|사업연도|손금|익금','각 사업연도 소득금액에서 이월결손금·비과세소득·소득공제를 차감해 과세표준을 구합니다. 제공된 출제연도 세율과 사업연도 조건을 사용하세요.'),
('현금흐름표','재무제표',r'현금흐름','영업·투자·재무활동을 구분하고 비현금거래를 제외하세요. 간접법에서는 비현금손익과 영업 관련 자산·부채 변동을 조정합니다.'),
('재고자산','자산',r'재고자산|선입선출|평균법|재고감모','취득원가에 포함할 지출과 기간비용을 구분하세요. 기말재고 평가방법이 매출원가와 당기손익에 미치는 방향도 함께 확인하세요.'),
('유형·무형자산','자산',r'유형자산|무형자산|감가상각|개발비|손상차손','취득원가, 잔존가치, 내용연수, 상각방법을 먼저 정리하세요. 처분손익은 처분대가와 처분 시점 장부금액의 차이입니다.'),
('유가증권·투자','자산',r'유가증권|단기매매증권|매도가능증권|만기보유|지분법','보유 목적에 따른 증권 분류를 먼저 확인하세요. 분류에 따라 기말 평가방법과 평가손익의 당기손익·자본 반영이 달라집니다.'),
('매출채권·대손','자산',r'매출채권|대손|외상매출금|받을어음','기말 필요 대손충당금과 대손 처리 후 남은 충당금을 비교해 추가 설정액을 계산합니다. 채권 양도는 매각거래와 차입거래를 구분하세요.'),
('현금·은행계정조정','자산',r'현금및현금|당좌예금|은행계정|현금성자산','은행 측 조정사항과 회사 측 조정사항을 나누세요. 미인출수표·미기입예금과 회사의 기장 오류를 구별하는 것이 핵심입니다.'),
('부채·사채','부채',r'사채|충당부채|퇴직급여|유동부채|부채','현재 의무, 자원 유출 가능성, 신뢰성 있는 측정을 확인하세요. 사채는 액면금액과 장부금액, 액면이자와 유효이자를 구분합니다.'),
('자본·이익잉여금','자본',r'자본|배당|자기주식|이익잉여금','자본거래와 손익거래를 구분하세요. 자기주식 거래는 자본거래이며 배당은 비용이 아니라 이익잉여금의 처분입니다.'),
('수익·비용 인식','손익',r'수익|매출|비용|수익인식','현금 수취·지급 시점과 수익·비용 귀속 시점은 다를 수 있습니다. 거래 조건과 기간 경과, 제공된 자료에 따라 인식 시점을 판단하세요.'),
('회계원리·재무제표','회계기초',r'.','재무상태표는 일정 시점, 손익계산서와 현금흐름표는 일정 기간의 정보를 제공합니다. 일반기업회계기준과 문제에 제시된 가정을 기준으로 판단하세요.')]

def classify(stem,body,num):
    candidates=TOPICS[:11] if num>40 else TOPICS[11:]
    for name,unit,pattern,note in candidates:
        if re.search(pattern,stem):return name,unit,note
    for name,unit,pattern,note in candidates:
        if re.search(pattern,body):return name,unit,note
    return '세법 기초','조세총론','납세의무자, 과세대상, 과세기간과 신고·납부 절차를 구분해 정리하세요.'

questions=[]; report=[]
for f in sorted((ROOT/'sources').glob('2026_*.md')):
    month=int(re.search(r'_(\d+)월',f.name)[1]); af=next((ROOT/'sources').glob(f'26년_{month}월_*'))
    answers={}
    for line in af.read_text().splitlines():
        cells=[c.strip() for c in line.strip().strip('|').split('|')]
        if len(cells)==8 and all(c.isdigit() for c in cells):
            for i in range(0,8,2):
                n,a=map(int,cells[i:i+2]);assert n not in answers;assert 1<=a<=4;answers[n]=a
    assert set(answers)==set(range(1,81))
    text=f.read_text(); matches=list(re.finditer(r'【\s*(\d+)\s*】',text))
    assert [int(m[1]) for m in matches]==list(range(1,81))
    for i,m in enumerate(matches):
        n=int(m[1]); body=text[m.end():matches[i+1].start() if i<79 else len(text)].strip()
        if n==40:body=re.split(r'<\s*세무회계\s*>',body)[0].strip()
        choices=list(re.finditer(r'^\s*(?:-\s*)?([①②③④])\s*',body,re.M))
        full=len(choices)==4 and [c[1] for c in choices]==list('①②③④')
        stem=body[:choices[0].start()].strip() if choices else body
        options=[body[c.end():choices[j+1].start() if j<3 else len(body)].strip() for j,c in enumerate(choices)] if full else []
        symbols=set(re.findall('[①②③④]',body)); incomplete=not set('①②③④')<=symbols
        topic,unit,note=classify(stem,body,n)
        q={'id':f'2026-{month:02d}-{n:02d}','year':2026,'month':month,'number':n,'subject':'재무회계' if n<=40 else '세무회계','unit':unit,'topic':topic,'format':'계산형' if re.search('얼마|계산하면|계산한',stem) else '개념형','html':render(stem if full else body),'options':[render(o) for o in options],'answer':answers[n],'source':f.name,'answerSource':af.name,'note':note,'incomplete':incomplete,'raw':body}
        if month==9 and n==72:q['explanation']='①은 틀린 설명입니다. 수출에 영세율을 적용하면 관련 매입세액을 공제받을 수 있고, 공제세액이 매출세액을 초과하면 환급받을 수 있습니다. ② 면세재화의 수출에 영세율을 적용받으려면 법정 요건에 따른 면세포기가 필요합니다. ③ 내국신용장에 의한 재화 공급은 영세율 적용 대상입니다. ④ 영세율은 이전 거래단계의 부가세 부담까지 제거하는 완전면세 효과가 있습니다.'
        questions.append(q)
        if incomplete:report.append({'id':q['id'],'issue':'첨부 원문에 ④ 보기 누락 — 학습 기본 제외'})
    print(f'{month}월: 80문항 / 확정답안 80개 연결')
assert len(questions)==480 and len({q['id'] for q in questions})==480
(ROOT/'dist/questions.json').write_text(json.dumps(questions,ensure_ascii=False))
(ROOT/'dist/import-report.json').write_text(json.dumps({'total':len(questions),'issues':report},ensure_ascii=False,indent=2))
print('원문 확인 필요:',report)

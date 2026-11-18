// Chapter overrides use the existing synced topic field; legacy labels remain intact.
export function chapterFor(question, record, chapters) {
 const override=record?.topic?.startsWith('curriculum:')?record.topic.slice(11):null;
 return chapters.find(c=>c.id===override&&c.subject===question.subject)
  ||chapters.find(c=>c.id===question.chapterId&&c.subject===question.subject)
  ||{id:question.subject==='재무회계'?'F0-0':'T0-0',subject:question.subject,part:0,partName:'분류 확인 필요',chapterName:'분류 확인 필요',standalone:true};
}
export function chapterLabel(chapter) {
 return chapter.standalone?chapter.chapterName:`${chapter.chapter}장 ${chapter.chapterName}`;
}
export function chapterStats(questions,records) {
 const attempted=questions.filter(q=>records[q.id]?.attempts);
 const confident=attempted.filter(q=>records[q.id].correct&&records[q.id].confidence==='sure');
 return {total:questions.length,attempted:attempted.length,confident:confident.length,
  weak:attempted.length-confident.length};
}

// Browsing includes incomplete originals; solving still filters them out.
export function chapterQuestions(questions,records,chapters,{subject,year='',chapterId=''}={}) {
 return questions.filter(q=>(!subject||q.subject===subject)&&(!year||q.year===+year)&&(!chapterId||chapterFor(q,records[q.id],chapters).id===chapterId))
  .sort((a,b)=>b.year-a.year||a.month-b.month||a.number-b.number);
}
export function questionCounts(questions) {
 const available=questions.filter(q=>!q.incomplete).length;
 return {owned:questions.length,available,excluded:questions.length-available};
}
export function questionGroups(questions,mode='all') {
 if(!questions.length)return [];
 if(mode!=='year')return [{year:null,questions}];
 return [...new Set(questions.map(q=>q.year))].sort((a,b)=>b-a)
  .map(year=>({year,questions:questions.filter(q=>q.year===year)}));
}

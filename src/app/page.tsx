'use client';
import leven from 'leven';
import React, { useEffect, useRef, useState } from 'react';
import Matter from 'matter-js';

// ==============================================================================
// 1. 이미지 파일 목록
// ==============================================================================
const LOCAL_BACKGROUNDS = [
  '/backgrounds/back1.jpeg', '/backgrounds/back2.jpeg', '/backgrounds/back3.jpeg',
  '/backgrounds/back4.jpeg', '/backgrounds/back5.jpeg', '/backgrounds/back6.jpeg',
  '/backgrounds/back7.jpeg', '/backgrounds/back8.jpeg', '/backgrounds/back9.jpeg',
  '/backgrounds/back10.jpeg',
];

type BibleVerse = {
  ref: string; text: string; book: string; chapter: number; verse: number;
};

// ==============================================================================
// ★ 2. 초강력 길이 제한 로직 (조기 넘김 완벽 차단)
// ==============================================================================
const isMatchEnough = (userInput: string, targetVerse: string) => {
  if (!userInput || !targetVerse) return { passed: false, score: 0 };

  const normInput = userInput.normalize('NFC');
  const normTarget = targetVerse.normalize('NFC');

  // 공백 제거 버전 (순수 글자 수 비교)
  const cleanTargetRaw = normTarget.replace(/\s+/g, '');
  const cleanInputRaw = normInput.replace(/\s+/g, '');

  // ★ [핵심 변경] 길이 제한을 80% -> 95%로 상향
  // 즉, 문장의 95% 이상을 말하지 않으면 아예 채점도 안 하고 탈락시킵니다.
  // 예: "태초에 하나님이 천지를" (탈락) -> "...창조하시니라" (통과)
  if (cleanInputRaw.length < cleanTargetRaw.length * 0.95) {
      return { passed: false, score: 0 }; 
  }

  // 특수문자 제거 및 단어 분리
  const cleanTarget = normTarget.replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, '').trim();
  const cleanInput = normInput.replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, '').trim();
  
  const targetWords = cleanTarget.split(/\s+/).filter(w => w.length > 0);
  const totalWords = targetWords.length;

  if (totalWords === 0) return { passed: false, score: 0 };

  let matchCount = 0;
  targetWords.forEach(word => {
    // 1. 단어 포함 여부
    if (cleanInput.includes(word)) {
      matchCount++;
    } 
    // 2. 유연성 (앞 두 글자)
    else if (word.length >= 2) {
      const root = word.substring(0, 2);
      if (cleanInput.includes(root)) {
        matchCount++;
      }
    }
  });

  const score = Math.round((matchCount / totalWords) * 100);
  
  // ★ [핵심 변경] 통과 기준 점수도 40% -> 60%로 상향
  // 길이는 맞췄는데 엉뚱한 소리를 했을 경우를 방지
  const passed = score >= 60; 

  return { passed, score };
};

export default function Home() {
  const sceneRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Matter.Engine | null>(null);
  const bodiesRef = useRef<Matter.Body[]>([]); 
  const inputRef = useRef<HTMLInputElement>(null);

  const recognitionRef = useRef<any>(null); 
  const isListeningDesired = useRef(false); 
  const isInputBlocked = useRef(false); // 입력 차단 플래그

  const [allVerses, setAllVerses] = useState<BibleVerse[]>([]);
  const [activeVerses, setActiveVerses] = useState<BibleVerse[]>([]);
  const [bookList, setBookList] = useState<string[]>([]);
  const [chapterList, setChapterList] = useState<number[]>([]);
  const [selectedBook, setSelectedBook] = useState("");
  const [selectedChapter, setSelectedChapter] = useState(0);

  const [verseIndex, setVerseIndex] = useState(0);
  const [inputText, setInputText] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);
  const [loading, setLoading] = useState(true);
  const [completedSet, setCompletedSet] = useState<Set<string>>(new Set());
  const [showTable, setShowTable] = useState(false);
  const [bgUrl, setBgUrl] = useState("");
  const [currentScore, setCurrentScore] = useState(0);
  const [isMicOn, setIsMicOn] = useState(false);

  const currentVerse = activeVerses[verseIndex] || { ref: "로딩 중...", text: "잠시만 기다려주세요...", book:"", chapter:0, verse:0 };

  const playSound = (type: 'type' | 'heaven' | 'error') => {
    try {
        const audio = new Audio(`/sounds/${type}.wav`);
        if (type === 'type') audio.volume = 0.3;
        if (type === 'heaven') audio.volume = 0.6;
        if (type === 'error') audio.volume = 0.4;
        audio.play().catch(() => {});
    } catch (e) {}
  };

  const startListening = () => {
    if (!('webkitSpeechRecognition' in window)) {
        alert('이 브라우저에서는 음성 인식이 지원되지 않습니다.');
        return;
    }

    if (isMicOn) return;
    isListeningDesired.current = true; 

    if (!recognitionRef.current) {
        // @ts-ignore
        const recognition = new window.webkitSpeechRecognition();
        recognition.continuous = true; 
        recognition.interimResults = true; 
        recognition.lang = 'ko-KR';

        recognition.onstart = () => {
            setIsMicOn(true);
            if (inputRef.current) inputRef.current.placeholder = "듣고 있습니다... (말씀을 읽으세요)";
        };

        recognition.onresult = (event: any) => {
            if (isInputBlocked.current) return;

            let transcript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                transcript += event.results[i][0].transcript;
            }
            setInputText(transcript.normalize('NFC')); 
        };

        recognition.onend = () => {
            setIsMicOn(false);
            if (inputRef.current) inputRef.current.placeholder = "마이크 대기 중...";
            if (isListeningDesired.current) {
                try { recognition.start(); } catch (e) { isListeningDesired.current = false; }
            }
        };
        recognitionRef.current = recognition;
    }
    try { recognitionRef.current.start(); } catch (e) {}
  };

  const stopListening = () => {
      isListeningDesired.current = false;
      if (recognitionRef.current) recognitionRef.current.stop();
      setIsMicOn(false);
  };

  const toggleMic = () => {
      if (isMicOn) stopListening();
      else startListening();
  };

  useEffect(() => {
    const randomBg = LOCAL_BACKGROUNDS[Math.floor(Math.random() * LOCAL_BACKGROUNDS.length)];
    setBgUrl(randomBg);
    const savedCompleted = localStorage.getItem('logos_completed');
    if (savedCompleted) setCompletedSet(new Set(JSON.parse(savedCompleted)));
    const lastBook = localStorage.getItem('logos_last_book');
    const lastChapter = localStorage.getItem('logos_last_chapter');

    fetch('/bible.json')
      .then(res => res.json())
      .then(data => {
        let rawData: {ref: string, text: string}[] = [];
        if (Array.isArray(data)) rawData = data;
        else rawData = Object.entries(data).map(([k, v]) => ({ ref: k, text: String(v) }));
        const parsedData: BibleVerse[] = rawData.map(item => {
            const match = item.ref.match(/^([^\d:]+)\s*(\d+):(\d+)$/);
            if (match) { return { ...item, book: match[1].trim(), chapter: parseInt(match[2]), verse: parseInt(match[3]) }; }
            return { ...item, book: "기타", chapter: 0, verse: 0 };
        }).filter(v => v.book !== "기타");

        setAllVerses(parsedData);
        const books: string[] = [];
        parsedData.forEach(v => { if (!books.includes(v.book)) books.push(v.book); });
        setBookList(books);
        if (lastBook && books.includes(lastBook)) {
            setSelectedBook(lastBook);
            setSelectedChapter(lastChapter ? parseInt(lastChapter) : 1);
        } else if (books.length > 0) {
            setSelectedBook(books[0]);
            setSelectedChapter(1);
        }
        setLoading(false);
      })
      .catch(err => { console.error(err); setLoading(false); });
  }, []);

  useEffect(() => {
    if (!selectedBook) return;
    const versesInBook = allVerses.filter(v => v.book === selectedBook);
    const chapters = Array.from(new Set(versesInBook.map(v => v.chapter))).sort((a, b) => a - b);
    setChapterList(chapters);
    if (!chapters.includes(selectedChapter) && chapters.length > 0) setSelectedChapter(chapters[0]);
    localStorage.setItem('logos_last_book', selectedBook);
  }, [selectedBook, allVerses]);

  useEffect(() => {
    if (!selectedBook || !selectedChapter) return;
    localStorage.setItem('logos_last_chapter', selectedChapter.toString());
    const targetVerses = allVerses.filter(v => v.book === selectedBook && v.chapter === selectedChapter).sort((a, b) => a.verse - b.verse);
    setActiveVerses(targetVerses);
    const firstIncompleteIndex = targetVerses.findIndex(v => !completedSet.has(v.ref));
    setVerseIndex(firstIncompleteIndex !== -1 ? firstIncompleteIndex : 0);
    
    setInputText("");
    setCurrentScore(0);
    setTimeout(() => { isInputBlocked.current = false; }, 100);

  }, [selectedBook, selectedChapter, allVerses]);

  useEffect(() => {
    const initPhysics = async () => {
      if (typeof window === 'undefined') return;
      try {
        // @ts-ignore
        await import('pathseg');
        // @ts-ignore
        const decomp = await import('poly-decomp');
        const Engine = Matter.Engine, Render = Matter.Render, Runner = Matter.Runner, Bodies = Matter.Bodies, Composite = Matter.Composite, Mouse = Matter.Mouse;
        Matter.Common.setDecomp(decomp.default || decomp);
        if (engineRef.current) return;
        const engine = Engine.create();
        engineRef.current = engine;
        const world = engine.world;
        if (!sceneRef.current) return;
        const render = Render.create({ element: sceneRef.current, engine: engine, options: { width: window.innerWidth, height: window.innerHeight, background: 'transparent', wireframes: false, showAngleIndicator: false, pixelRatio: 1 } });
        const wallOptions = { isStatic: true, render: { fillStyle: '#000000', opacity: 0.3 } };
        const ground = Bodies.rectangle(window.innerWidth / 2, window.innerHeight + 30, window.innerWidth, 60, wallOptions);
        const leftWall = Bodies.rectangle(-30, window.innerHeight / 2, 60, window.innerHeight, wallOptions);
        const rightWall = Bodies.rectangle(window.innerWidth + 30, window.innerHeight / 2, 60, window.innerHeight, wallOptions);
        bodiesRef.current = []; 
        const mouse = Mouse.create(render.canvas);
        const mouseConstraint = Matter.MouseConstraint.create(engine, { mouse: mouse, constraint: { stiffness: 0.2, render: { visible: false } } });
        render.mouse = mouse;
        Composite.add(world, [ground, leftWall, rightWall, mouseConstraint]);
        Render.run(render);
        const runner = Runner.create();
        Runner.run(runner, engine);
      } catch (e) {}
    };
    initPhysics();
    const handleResize = () => {}; 
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const performSuccessAction = (verseRef: string) => {
    isInputBlocked.current = true; 
    playSound('heaven');
    setIsSuccess(true);
    
    const newSet = new Set(completedSet);
    newSet.add(verseRef);
    setCompletedSet(newSet);
    localStorage.setItem('logos_completed', JSON.stringify(Array.from(newSet)));

    setTimeout(() => { 
        setInputText(""); 
        setCurrentScore(0);
        
        if (verseIndex < activeVerses.length - 1) {
            setVerseIndex(prev => prev + 1);
            // 0.3초 대기 (빠른 전환)
            setTimeout(() => { isInputBlocked.current = false; }, 300);
        } else {
            alert("이 장의 마지막 말씀입니다! 수고하셨습니다.");
            stopListening(); 
            isInputBlocked.current = false;
        }
        setIsSuccess(false);
    }, 500); 
  };

  useEffect(() => {
    if (isInputBlocked.current || isSuccess || loading || !currentVerse.text) return;
    if (!inputText || inputText.trim().length < 1) return;

    const result = isMatchEnough(inputText, currentVerse.text);
    setCurrentScore(result.score);

    if (result.passed) {
        performSuccessAction(currentVerse.ref);
    }
  }, [inputText, currentVerse, isSuccess, loading]); 

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isInputBlocked.current) return;
    setInputText(e.target.value.normalize('NFC'));
    playSound('type');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !loading) {
       performSuccessAction(currentVerse.ref);
    }
  };

  const renderVerseText = () => {
    const targetText = currentVerse.text.normalize('NFC');
    const typedText = inputText.normalize('NFC');
    // 진행률 시각화용 변수
    const targetLen = targetText.replace(/\s+/g, '').length;
    const inputLen = typedText.replace(/\s+/g, '').length;
    const lenPercent = Math.min(Math.round((inputLen / targetLen) * 100), 100);

    return (
        <div>
            <h1 style={{ 
                color: isSuccess ? '#00ffff' : '#ffffff', 
                fontSize: '18px', fontWeight: '900', lineHeight: '1.6', wordBreak: 'keep-all', 
                textShadow: isSuccess ? '0 0 40px #00ffff' : '0 0 15px #ffffff, 0 0 5px #000000', 
                transition: 'all 0.5s ease', padding: '0 10px' 
            }}>
            {targetText.split('').map((char, index) => {
                const isTyped = index < typedText.length;
                const targetChar = targetText[index];
                const inputChar = typedText[index];
                let charColor = '#ffffff';
                if (isTyped) {
                    const isCorrect = targetChar === inputChar;
                    charColor = isCorrect ? '#ffe600' : '#ff5555';
                }
                return <span key={index} style={{ color: charColor, transition: 'color 0.1s linear' }}>{char}</span>;
            })}
            </h1>
            
            {/* ★ 진행 상황 디버그 바 (캡틴 확인용) */}
            <div style={{ marginTop: '10px', fontSize: '11px', color: '#aaa' }}>
                <span style={{ color: lenPercent >= 95 ? '#00ff00' : '#ff5555', marginRight: '10px' }}>
                   길이: {lenPercent}% (95% 필요)
                </span>
                <span style={{ color: currentScore >= 60 ? '#00ff00' : '#ff5555' }}>
                   정확도: {currentScore}% (60% 필요)
                </span>
            </div>
        </div>
    );
  };
  
  const renderReadingTable = () => {
    if (!showTable) return null;
    const chaptersInBook = chapterList.map(ch => {
        const totalVerses = allVerses.filter(v => v.book === selectedBook && v.chapter === ch);
        const doneVerses = totalVerses.filter(v => completedSet.has(v.ref));
        const progress = Math.round((doneVerses.length / totalVerses.length) * 100) || 0;
        return { chapter: ch, progress, isFull: progress === 100 };
    });

    return (
        <div style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.8)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
            <div style={{ width: '90%', maxWidth: '800px', background: '#f5f5f5', padding: '40px', borderRadius: '20px', boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', borderBottom: '2px solid #ddd', paddingBottom: '15px' }}>
                    <h2 style={{ margin: 0, fontSize: '28px', color: '#111', fontWeight: '800' }}>📖 {selectedBook} 읽기표</h2>
                    <button onClick={() => setShowTable(false)} style={{ background: 'transparent', border: 'none', color: '#333', fontSize: '28px', cursor: 'pointer' }}>✕</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: '15px', maxHeight: '60vh', overflowY: 'auto', paddingRight: '10px' }}>
                    {chaptersInBook.map(item => (
                        <div key={item.chapter} onClick={() => { setSelectedChapter(item.chapter); setShowTable(false); }}
                            style={{
                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', borderRadius: '12px', cursor: 'pointer', padding: '10px',
                                background: '#ffffff', border: item.chapter === selectedChapter ? '2px solid #000' : '1px solid #ddd', boxShadow: '0 4px 6px rgba(0,0,0,0.05)', transition: 'transform 0.2s'
                            }}
                        >
                            <span style={{ fontSize: '20px', fontWeight: 'bold', color: '#333', marginBottom: '5px' }}>{item.chapter}장</span>
                            <div style={{ width: '100%', height: '8px', background: '#eee', borderRadius: '4px', overflow: 'hidden', marginBottom: '5px' }}>
                                <div style={{ width: `${item.progress}%`, height: '100%', background: item.isFull ? '#FFD700' : '#4CAF50', transition: 'width 0.5s ease' }} />
                            </div>
                            <span style={{ fontSize: '12px', color: item.isFull ? '#DAA520' : '#888', fontWeight: '600' }}>{item.isFull ? '완료!' : `${item.progress}%`}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh', overflow: 'hidden', fontFamily: 'sans-serif' }}>
      <div style={{ 
          position: 'absolute', inset: 0, zIndex: 0, 
          backgroundImage: bgUrl ? `url('${bgUrl}')` : 'none', 
          backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.5,
          transition: 'background-image 0.5s ease-in'
        }} 
      />
      <div ref={sceneRef} style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none' }} />

      <button onClick={() => setShowTable(true)} style={{ position: 'absolute', top: '20px', right: '30px', zIndex: 30, background: 'rgba(255, 255, 255, 0.9)', color: '#000', border: 'none', padding: '10px 20px', borderRadius: '30px', cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 4px 10px rgba(0,0,0,0.3)' }}>📊 성경읽기표</button>
      
      {renderReadingTable()}
      
      <div style={{ position: 'absolute', top: '80px', left: '50%', transform: 'translate(-50%, 0)', zIndex: 20, display: 'flex', gap: '10px', background: 'rgba(0,0,0,0.6)', padding: '8px 20px', borderRadius: '30px', border: '1px solid #333', backdropFilter: 'blur(5px)', width: 'max-content' }}>
        <select value={selectedBook} onChange={(e) => setSelectedBook(e.target.value)} style={{ background: 'transparent', color: 'white', border: 'none', fontSize: '16px', outline: 'none', cursor: 'pointer', fontWeight: 'bold' }}>{bookList.map(book => <option key={book} value={book} style={{color:'black'}}>{book}</option>)}</select>
        <span style={{color:'#666'}}>|</span>
        <select value={selectedChapter} onChange={(e) => setSelectedChapter(Number(e.target.value))} style={{ background: 'transparent', color: '#ffe600', border: 'none', fontSize: '16px', outline: 'none', cursor: 'pointer', fontWeight: 'bold' }}>{chapterList.map(ch => <option key={ch} value={ch} style={{color:'black'}}>{ch}장</option>)}</select>
      </div>

      <div style={{ position: 'absolute', top: '55%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 10, textAlign: 'center', width: '95%', maxWidth: '1000px', pointerEvents: 'none' }}>
        <div style={{ marginBottom: '30px' }}>
            <span style={{ 
                color: '#ffffff', fontSize: '13px', letterSpacing: '2px', display: 'block', marginBottom: '10px', 
                textShadow: '0 0 3px #000000, 0 0 1px #ffffff' }}>
                LOGOS PROJECT : {currentVerse.book} {currentVerse.chapter}:{currentVerse.verse}
                <span style={{ marginLeft: '10px', color: '#dddddd', fontSize: '12px' }}>({verseIndex + 1} / {activeVerses.length})</span>
                {completedSet.has(currentVerse.ref) && (<span style={{ marginLeft: '8px', color: '#ffe600', border: '1px solid #ffe600', padding: '1px 6px', borderRadius: '8px', fontSize: '11px', backgroundColor: 'rgba(0,0,0,0.5)' }}>완료됨</span>)}
            </span>
            
            {renderVerseText()} 
            
            <div style={{ fontSize: '13px', color: isMicOn ? '#00ff00' : '#ffe600', marginTop: '10px', fontWeight:'bold' }}>
               {isMicOn ? "🟢 마이크 켜짐" : "🔴 마이크 꺼짐"}
            </div>
        </div>
        
        {!loading && (
            <div style={{ display: 'flex', width: '100%', maxWidth: '1000px', margin: '0 auto', pointerEvents: 'auto' }}>
                <input 
                    ref={inputRef}
                    type="text" value={inputText} onChange={handleInputChange} onKeyDown={handleKeyDown} 
                    placeholder="말씀을 입력하거나 음성으로 말해보세요..." spellCheck="false" 
                    style={{ 
                        flexGrow: 1, padding: '15px', fontSize: '16px', borderRadius: '15px 0 0 15px', 
                        border: '2px solid rgba(255,255,255,0.3)', 
                        background: 'rgba(0, 0, 0, 0.4)', 
                        color: '#ffe600', outline: 'none', textAlign: 'center', 
                        boxShadow: '0 15px 40px rgba(0,0,0,0.6)', borderRight: 'none',
                        transition: 'border-color 0.3s, box-shadow 0.3s' 
                    }} 
                />
                
                <button 
                    onClick={toggleMic}
                    style={{
                        background: isMicOn ? 'rgba(0, 255, 0, 0.9)' : 'rgba(255, 230, 0, 0.9)', 
                        color: 'black', border: `2px solid ${isMicOn ? '#00ff00' : '#ffe600'}`, 
                        padding: '0 15px', fontSize: '20px', cursor: 'pointer', fontWeight: 'bold',
                        borderRadius: '0 15px 15px 0', boxShadow: '0 15px 40px rgba(0,0,0,0.6)',
                        borderLeft: 'none', transition: 'background 0.3s'
                    }}
                >
                    {isMicOn ? '🔴' : '🎤'}
                </button>
            </div>
        )}
      </div>
    </div>
  );
}
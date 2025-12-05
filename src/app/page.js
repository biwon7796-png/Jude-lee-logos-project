/* eslint-disable */
'use client';
import leven from 'leven';
import React, { useEffect, useRef, useState } from 'react';
import Matter from 'matter-js';
// Clerk 관련 기능 가져오기
import { SignInButton, SignedIn, SignedOut, UserButton, useUser } from '@clerk/nextjs';

const LOCAL_BACKGROUNDS = [
  '/backgrounds/back1.jpeg', '/backgrounds/back2.jpeg', '/backgrounds/back3.jpeg',
  '/backgrounds/back4.jpeg', '/backgrounds/back5.jpeg', '/backgrounds/back6.jpeg',
  '/backgrounds/back7.jpeg', '/backgrounds/back8.jpeg', '/backgrounds/back9.jpeg',
  '/backgrounds/back10.jpeg',
];



// ==============================================================================
// 2. 하이브리드 판정 로직
const isMatchEnough = (userInput, targetVerse, inputType) => {
  if (!userInput || !targetVerse) return { passed: false, score: 0, lenPercent: 0 };

  const normInput = userInput.normalize('NFC');
  const normTarget = targetVerse.normalize('NFC');
  const cleanTargetRaw = normTarget.replace(/\s+/g, '');
  const cleanInputRaw = normInput.replace(/\s+/g, '');

  const lenPercent = targetVerse.length > 0 
    ? Math.min(Math.round((cleanInputRaw.length / cleanTargetRaw.length) * 100), 100) 
    : 0;

  // 길이 기준: 타자(100%), 음성(95%)
  const lengthThreshold = inputType === 'typing' ? 1.0 : 0.95;

  if (cleanInputRaw.length < cleanTargetRaw.length * lengthThreshold) {
      return { passed: false, score: 0, lenPercent }; 
  }

  const cleanTarget = normTarget.replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, '').trim();
  const cleanInput = normInput.replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, '').trim();
  
  const targetWords = cleanTarget.split(/\s+/).filter(w => w.length > 0);
  const totalWords = targetWords.length;

  if (totalWords === 0) return { passed: false, score: 0, lenPercent };

  let matchCount = 0;
  targetWords.forEach(word => {
    if (cleanInput.includes(word)) {
      matchCount++;
    } else if (word.length >= 2) {
      const root = word.substring(0, 2);
      if (cleanInput.includes(root)) matchCount++;
    }
  });

  const score = Math.round((matchCount / totalWords) * 100);
  // 정확도 기준: 타자(80%), 음성(70%)
  const scoreThreshold = inputType === 'typing' ? 80 : 70;
  const passed = score >= scoreThreshold; 

  return { passed, score, lenPercent };
};

export default function Home() {
  const { user, isLoaded } = useUser();
  const [showIntro, setShowIntro] = useState(true);

  // Refs
  const sceneRef = useRef(null);
  const engineRef = useRef(null);
  const bodiesRef = useRef([]); 
  const inputRef = useRef(null);

  // 마이크 관련 Refs
  const recognitionRef = useRef(null); 
  const isListeningDesired = useRef(false); 
  const isInputBlocked = useRef(false);

  const [allVerses, setAllVerses] = useState([]);
  const [activeVerses, setActiveVerses] = useState([]);
  const [bookList, setBookList] = useState([]);
  const [chapterList, setChapterList] = useState([]);
  const [selectedBook, setSelectedBook] = useState("");
  const [selectedChapter, setSelectedChapter] = useState(0);

  const [verseIndex, setVerseIndex] = useState(0);
  const [inputText, setInputText] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);
  const [loading, setLoading] = useState(true);
  const [completedSet, setCompletedSet] = useState(new Set());
  const [showTable, setShowTable] = useState(false);
  const [bgUrl, setBgUrl] = useState("");
  
  const [currentScore, setCurrentScore] = useState(0);
  const [currentLenPercent, setCurrentLenPercent] = useState(0);
  const [isMicOn, setIsMicOn] = useState(false);
  const [inputType, setInputType] = useState('speech');

  const currentVerse = activeVerses[verseIndex] || { ref: "로딩 중...", text: "잠시만 기다려주세요...", book:"", chapter:0, verse:0 };

  useEffect(() => {
    if (isLoaded && user) setShowIntro(false);
  }, [isLoaded, user]);

  const playSound = (type) => {
    try {
        const audio = new Audio(`/sounds/${type}.wav`);
        if (type === 'type') audio.volume = 0.3;
        if (type === 'heaven') audio.volume = 0.6;
        if (type === 'error') audio.volume = 0.4;
        audio.play().catch(() => {});
    } catch (e) {}
  };

  // ==============================================================================
  // ★ 3. 음성 인식 엔진
  // ==============================================================================
  
  const createRecognition = () => {
      // @ts-ignore
      const recognition = new window.webkitSpeechRecognition();
      recognition.continuous = true;  
      recognition.interimResults = true; 
      recognition.lang = 'ko-KR';

      recognition.onstart = () => {
          setIsMicOn(true);
          if (inputRef.current) inputRef.current.placeholder = "듣고 있습니다... (말씀을 읽으세요)";
      };

      recognition.onresult = (event) => {
          if (isInputBlocked.current) return; 

          setInputType('speech');
          let transcript = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
              transcript += event.results[i][0].transcript;
          }
          if (transcript.trim()) {
              setInputText(transcript.normalize('NFC'));
          }
      };

      recognition.onerror = (event) => {
          console.error("마이크 에러:", event.error);
          if (event.error !== 'aborted') {
              handleRestart(); 
          }
      };

      recognition.onend = () => {
          if (isListeningDesired.current) {
              handleRestart();
          } else {
              setIsMicOn(false);
              if (inputRef.current) inputRef.current.placeholder = "마이크 대기 중...";
          }
      };

      recognitionRef.current = recognition;
      try {
          recognition.start();
      } catch (e) {
          console.error("이미 시작됨:", e);
      }
  };

  const handleRestart = () => {
      if (!isListeningDesired.current) return;

      setTimeout(() => {
          if (isListeningDesired.current) {
              if (recognitionRef.current) {
                  try { recognitionRef.current.abort(); } catch(e) {}
                  recognitionRef.current = null;
              }
              createRecognition();
          }
      }, 500);
  };

  const startListening = () => {
    if (!('webkitSpeechRecognition' in window)) {
        alert('이 브라우저에서는 음성 인식이 지원되지 않습니다.');
        return;
    }

    isListeningDesired.current = true;
    setIsMicOn(true);

    if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
    }

    createRecognition();
  };

  const stopListening = () => {
      isListeningDesired.current = false;
      if (recognitionRef.current) recognitionRef.current.abort();
      setIsMicOn(false);
      if (recognitionRef.current) {
          recognitionRef.current.abort();
          recognitionRef.current = null;
      }
  };

  const toggleMic = () => {
      if (isListeningDesired.current) stopListening();
      else startListening();
  };

  // 초기 데이터 로딩
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
        let rawData = [];
        if (Array.isArray(data)) rawData = data;
        else rawData = Object.entries(data).map(([k, v]) => ({ ref: k, text: String(v) }));
        const parsedData = rawData.map(item => {
            const match = item.ref.match(/^([^\d:]+)\s*(\d+):(\d+)$/);
            if (match) { return { ...item, book: match[1].trim(), chapter: parseInt(match[2]), verse: parseInt(match[3]) }; }
            return { ...item, book: "기타", chapter: 0, verse: 0 };
        }).filter(v => v.book !== "기타");

        setAllVerses(parsedData);
        const books = [];
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
    setCurrentLenPercent(0);

    isInputBlocked.current = true;
    setTimeout(() => { 
        isInputBlocked.current = false; 
    }, 500);

  }, [selectedBook, selectedChapter, allVerses]);

  // ★ 여기가 중요합니다! 타입 에러 무시 코드 추가됨 ★
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

  const performSuccessAction = (verseRef) => {
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
        setCurrentLenPercent(0);
        
        if (verseIndex < activeVerses.length - 1) {
            setVerseIndex(prev => prev + 1);
            // useEffect에서 0.5초 뒤 차단 해제됨
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

    const result = isMatchEnough(inputText, currentVerse.text, inputType);
    setCurrentScore(result.score);
    setCurrentLenPercent(result.lenPercent);

    if (result.passed) {
        performSuccessAction(currentVerse.ref);
    }
  }, [inputText, currentVerse, isSuccess, loading, inputType]); 

  const handleInputChange = (e) => {
    if (isInputBlocked.current) return;
    setInputType('typing');
    setInputText(e.target.value.normalize('NFC'));
    playSound('type');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !loading) {
       performSuccessAction(currentVerse.ref);
    }
  };

  const renderVerseText = () => {
    const targetText = currentVerse.text.normalize('NFC');
    const typedText = inputText.normalize('NFC');
    const targetLen = inputType === 'typing' ? 100 : 95;
    const targetScore = inputType === 'typing' ? 80 : 70;

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
                    charColor = isCorrect ? '#ffe600' : '#ffffff';
                }
                return <span key={index} style={{ color: charColor, transition: 'color 0.1s linear' }}>{char}</span>;
            })}
            </h1>
            
            <div style={{ marginTop: '10px', fontSize: '11px', color: '#aaa', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div>
                   모드: <span style={{ color: '#ffe600', fontWeight: 'bold' }}>{inputType === 'typing' ? '⌨️ 타자' : '🎤 음성'}</span>
                </div>
                <div>
                    <span style={{ color: currentLenPercent >= targetLen ? '#00ff00' : '#ff5555', marginRight: '10px' }}>
                    길이: {currentLenPercent}% ({targetLen}% 필요)
                    </span>
                    <span style={{ color: currentScore >= targetScore ? '#00ff00' : '#ff5555' }}>
                    정확도: {currentScore}% ({targetScore}% 필요)
                    </span>
                </div>
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
      
      {/* Version Check Label */}
      <div style={{ position: 'absolute', top: '10px', left: '10px', zIndex: 100, color: 'rgba(255,255,255,0.5)', fontSize: '12px', pointerEvents: 'none' }}>
        Ver 13.3 (Removed Type Definition)
      </div>

      {showIntro && (
        <div style={{ 
            position: 'absolute', inset: 0, zIndex: 9999, 
            backgroundColor: '#000',
            backgroundImage: bgUrl ? `url('${bgUrl}')` : 'none', 
            backgroundSize: 'cover', backgroundPosition: 'center',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            color: 'white', transition: 'opacity 0.5s ease'
        }}>
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)' }} />
            
            <div style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
                <h1 style={{ fontSize: '40px', fontWeight: '900', marginBottom: '10px', textShadow: '0 0 20px rgba(255,255,255,0.5)' }}>
                    LOGOS PROJECT
                </h1>
                <p style={{ fontSize: '18px', marginBottom: '40px', color: '#ccc' }}>
                    AI 성경 통독 & 암송 도우미
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    <SignInButton mode="modal">
                        <button style={{
                            padding: '15px 40px', fontSize: '18px', fontWeight: 'bold', 
                            borderRadius: '30px', border: 'none', cursor: 'pointer',
                            background: '#ffe600', color: '#000', boxShadow: '0 5px 15px rgba(255, 230, 0, 0.4)'
                        }}>
                            로그인하고 시작하기
                        </button>
                    </SignInButton>

                    <button 
                        onClick={() => setShowIntro(false)}
                        style={{
                            padding: '12px 30px', fontSize: '16px', fontWeight: 'bold', 
                            borderRadius: '30px', border: '2px solid rgba(255,255,255,0.3)', 
                            background: 'transparent', color: '#fff', cursor: 'pointer'
                        }}
                    >
                        그냥 체험하기 (게스트)
                    </button>
                </div>
            </div>
        </div>
      )}

      <div style={{ position: 'absolute', top: '20px', left: '20px', zIndex: 100 }}>
        <SignedIn>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(0,0,0,0.5)', padding: '5px 10px', borderRadius: '30px', border:'1px solid rgba(255,255,255,0.2)' }}>
                <UserButton afterSignOutUrl="/"/>
                <span style={{ color: 'white', fontSize: '12px', fontWeight: 'bold' }}>
                    {user ? `${user.firstName || '성도'}님` : ''}
                </span>
            </div>
        </SignedIn>
      </div>

      <div style={{ 
          position: 'absolute', inset: 0, zIndex: 0, 
          backgroundImage: bgUrl ? `url('${bgUrl}')` : 'none', 
          backgroundSize: 'cover', backgroundPosition: 'center',
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
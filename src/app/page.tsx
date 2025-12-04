'use client';

import React, { useEffect, useRef, useState } from 'react';
import Matter from 'matter-js';

// 배경 이미지
const BACKGROUND_IMAGE_URL = "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1920&q=80";

type BibleVerse = {
  ref: string; text: string; book: string; chapter: number; verse: number;
};

export default function Home() {
  const sceneRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Matter.Engine | null>(null);
  const bodiesRef = useRef<Matter.Body[]>([]); 

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

  useEffect(() => {
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
            if (match) {
                return { ...item, book: match[1].trim(), chapter: parseInt(match[2]), verse: parseInt(match[3]) };
            }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBook, selectedChapter, allVerses]);

  useEffect(() => {
    const initPhysics = async () => {
      if (typeof window === 'undefined') return;
      try {
        // ★★★ 여기가 수정되었습니다! (에러 무시 코드 추가) ★★★
        // @ts-ignore
        await import('pathseg');
        // @ts-ignore
        const decomp = await import('poly-decomp');
        
        const Engine = Matter.Engine, Render = Matter.Render, Runner = Matter.Runner, Bodies = Matter.Bodies, Composite = Matter.Composite, Mouse = Matter.Mouse, MouseConstraint = Matter.MouseConstraint, Common = Matter.Common;
        Common.setDecomp(decomp.default || decomp);
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
        const mouseConstraint = MouseConstraint.create(engine, { mouse: mouse, constraint: { stiffness: 0.2, render: { visible: false } } });
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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);
    playSound('type');
  };

  const handleSuccess = (verseRef: string) => {
    playSound('heaven');
    setIsSuccess(true);
    
    const newSet = new Set(completedSet);
    newSet.add(verseRef);
    setCompletedSet(newSet);
    localStorage.setItem('logos_completed', JSON.stringify(Array.from(newSet)));

    setInputText("");
    setTimeout(() => {
        if (verseIndex < activeVerses.length - 1) {
            setVerseIndex(prev => prev + 1);
        } else {
            alert("이 장의 마지막 말씀입니다! 수고하셨습니다.");
        }
        setIsSuccess(false);
    }, 1200);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !loading) {
        const cleanInput = inputText.trim().replace(/\s+/g, '');
        const cleanTarget = currentVerse.text.trim().replace(/\s+/g, '');
        if (cleanInput === cleanTarget) handleSuccess(currentVerse.ref);
        else { playSound('error'); alert("틀렸습니다. 오타를 확인해보세요!"); }
    }
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
        <div style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.8)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
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
                            onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-3px)'}
                            onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
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
      
      {/* 배경 이미지 */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 0, backgroundImage: `url('${BACKGROUND_IMAGE_URL}')`, backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.3 }} />
      
      {/* 물리 엔진 */}
      <div ref={sceneRef} style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none' }} />

      {/* 1. 성경읽기표 버튼 */}
      <button 
        onClick={() => setShowTable(true)} 
        style={{ 
            position: 'absolute', 
            top: '20px', 
            right: '20px', 
            zIndex: 30, 
            background: 'rgba(255, 255, 255, 0.9)', 
            color: '#000', 
            border: 'none', 
            padding: '8px 16px', 
            borderRadius: '30px', 
            cursor: 'pointer', 
            fontWeight: 'bold', 
            fontSize: '14px', 
            boxShadow: '0 4px 10px rgba(0,0,0,0.3)' 
        }}
      >
        📊 성경읽기표
      </button>
      
      {/* 성경읽기표 팝업 */}
      {renderReadingTable()}
      
      {/* 2. 성경 선택 탭 (아래로 내림) */}
      <div style={{ 
          position: 'absolute', 
          top: '80px', 
          left: '50%', 
          transform: 'translate(-50%, 0)', 
          zIndex: 20, 
          display: 'flex', 
          gap: '10px', 
          background: 'rgba(0,0,0,0.6)', 
          padding: '8px 20px', 
          borderRadius: '30px', 
          border: '1px solid #333', 
          backdropFilter: 'blur(5px)',
          width: 'max-content' 
      }}>
        <select value={selectedBook} onChange={(e) => setSelectedBook(e.target.value)} style={{ background: 'transparent', color: 'white', border: 'none', fontSize: '16px', outline: 'none', cursor: 'pointer', fontWeight: 'bold' }}>{bookList.map(book => <option key={book} value={book} style={{color:'black'}}>{book}</option>)}</select>
        <span style={{color:'#666'}}>|</span>
        <select value={selectedChapter} onChange={(e) => setSelectedChapter(Number(e.target.value))} style={{ background: 'transparent', color: '#ffe600', border: 'none', fontSize: '16px', outline: 'none', cursor: 'pointer', fontWeight: 'bold' }}>{chapterList.map(ch => <option key={ch} value={ch} style={{color:'black'}}>{ch}장</option>)}</select>
      </div>

      {/* 3. 말씀 입력창 (글씨 크기 축소) */}
      <div style={{ position: 'absolute', top: '55%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 10, textAlign: 'center', width: '95%', maxWidth: '1000px', pointerEvents: 'none' }}>
        <div style={{ marginBottom: '30px' }}> {/* 여백도 조금 줄임 */}
            <span style={{ color: '#ffffff', fontSize: '13px', letterSpacing: '2px', display: 'block', marginBottom: '10px', textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>
                LOGOS PROJECT : {currentVerse.book} {currentVerse.chapter}:{currentVerse.verse}
                <span style={{ marginLeft: '10px', color: '#ddd', fontSize: '12px' }}>({verseIndex + 1} / {activeVerses.length})</span>
                {completedSet.has(currentVerse.ref) && (<span style={{ marginLeft: '8px', color: '#ffe600', border: '1px solid #ffe600', padding: '1px 6px', borderRadius: '8px', fontSize: '11px', backgroundColor: 'rgba(0,0,0,0.5)' }}>완료됨</span>)}
            </span>
            
            {/* ★★★ 여기 크기를 줄였습니다 (24px -> 18px) ★★★ */}
            <h1 style={{ 
                color: isSuccess ? '#00ffff' : 'white', 
                fontSize: '18px', // 모바일에서 보기 편한 크기
                fontWeight: '700', 
                lineHeight: '1.6', 
                wordBreak: 'keep-all', 
                textShadow: isSuccess ? '0 0 40px #00ffff' : '0 2px 10px rgba(0,0,0,0.8)', 
                transition: 'all 0.5s ease', 
                padding: '0 10px' 
            }}>
                {currentVerse.text}
            </h1>
        </div>
        {!loading && (
            <input 
                type="text" 
                value={inputText} 
                onChange={handleInputChange} 
                onKeyDown={handleKeyDown} 
                placeholder="말씀을 입력하고 Enter" 
                spellCheck="false" 
                style={{ 
                    pointerEvents: 'auto', 
                    width: '100%', 
                    padding: '15px', // 패딩도 살짝 줄여서 날렵하게
                    fontSize: '16px', // 입력 글씨도 20px -> 16px로 조정
                    borderRadius: '15px', 
                    border: '2px solid rgba(255,255,255,0.3)', 
                    background: 'rgba(0, 0, 0, 0.4)', 
                    color: '#ffe600', 
                    outline: 'none', 
                    textAlign: 'center', 
                    boxShadow: '0 15px 40px rgba(0,0,0,0.6)', 
                    backdropFilter: 'blur(5px)', 
                    transition: 'border-color 0.3s, box-shadow 0.3s' 
                }} 
                onFocus={(e) => { e.target.style.borderColor = '#ffe600'; e.target.style.boxShadow = '0 0 30px rgba(255, 230, 0, 0.3)'; }} 
                onBlur={(e) => { e.target.style.borderColor = 'rgba(255,255,255,0.3)'; e.target.style.boxShadow = '0 15px 40px rgba(0,0,0,0.6)'; }} 
            />
        )}
      </div>
    </div>
  );
}
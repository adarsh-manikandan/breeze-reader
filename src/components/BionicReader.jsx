import React, { useState, useEffect, useRef } from 'react';
import JSZip from 'jszip';
import { Eye, EyeOff, Type, FileText, Zap, Copy, Check, Minus, Plus, BookOpen, ChevronLeft, ChevronRight, Upload, Menu, X, Bookmark, BookmarkCheck } from 'lucide-react';

const BionicReader = () => {
  const [inputText, setInputText] = useState('');
  const [showInput, setShowInput] = useState(true);
  const [bionicText, setBionicText] = useState('');
  const [isTransforming, setIsTransforming] = useState(false);
  const [displayedText, setDisplayedText] = useState('');
  const [hasTransformed, setHasTransformed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [fontSize, setFontSize] = useState(16);
  
  // EPUB-related state
  const [isEpubMode, setIsEpubMode] = useState(false);
  const [epubContent, setEpubContent] = useState(null);
  const [currentChapter, setCurrentChapter] = useState(0);
  const [chapters, setChapters] = useState([]);
  const [bookTitle, setBookTitle] = useState('');
  const [showToc, setShowToc] = useState(false);
  const [isLoadingEpub, setIsLoadingEpub] = useState(false);
  const [bookmarks, setBookmarks] = useState([]);
  const fileInputRef = useRef(null);

  // Store image Blob URLs for cleanup
  const [imageBlobs, setImageBlobs] = useState({});

  // Convert text to bionic reading format
  const convertToBionic = (text) => {
    if (!text.trim()) return '';
    
    return text.split(/(\s+)/).map((word, index) => {
      if (/^\s+$/.test(word)) {
        return word;
      }
      
      if (!word.trim()) return word;
      
      const cleanWord = word.replace(/[^\w]/g, '');
      if (cleanWord.length === 0) return word;
      
      let boldCount;
      if (cleanWord.length <= 2) {
        boldCount = 1;
      } else if (cleanWord.length <= 5) {
        boldCount = 2;
      } else {
        boldCount = Math.ceil(cleanWord.length * 0.4);
      }
      
      let letterCount = 0;
      let boldEnd = 0;
      
      for (let i = 0; i < word.length; i++) {
        if (/\w/.test(word[i])) {
          letterCount++;
          if (letterCount === boldCount) {
            boldEnd = i + 1;
            break;
          }
        }
      }
      
      if (boldEnd === 0) return word;
      
      const boldPart = word.slice(0, boldEnd);
      const normalPart = word.slice(boldEnd);
      
      return `<span style="font-weight: 600; color: #3d2914;">${boldPart}</span><span style="font-weight: 300; color: #6b5b4d;">${normalPart}</span>`;
    }).join('');
  };

  // Robust ZIP file reader for EPUB using jszip
  const readZipFile = async (file) => {
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    const files = {};
    const fileNames = Object.keys(zip.files);
    for (const fileName of fileNames) {
      const zipEntry = zip.files[fileName];
      // Only read as text if not a directory
      if (!zipEntry.dir) {
        files[fileName] = await zipEntry.async('text');
      }
    }
    return files;
  };

  // Helper: Recursively walk and bionic-transform only text nodes in-place
  function bionicTransformDomInPlace(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent.trim().length > 0) {
        // Create a span and set its innerHTML to the bionic version
        const span = document.createElement('span');
        span.innerHTML = convertToBionic(node.textContent);
        node.parentNode.replaceChild(span, node);
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      // Copy the childNodes array because we'll be modifying the DOM
      const children = Array.from(node.childNodes);
      for (let child of children) {
        bionicTransformDomInPlace(child);
      }
    }
  }

  // Helper: Extract images from EPUB and create Blob URLs
  const extractImageBlobs = async (zip) => {
    const blobs = {};
    const fileNames = Object.keys(zip.files);
    for (const fileName of fileNames) {
      if (fileName.match(/\.(jpe?g|png|gif|svg|webp|bmp)$/i)) {
        const fileData = await zip.files[fileName].async('blob');
        blobs[fileName] = URL.createObjectURL(fileData);
      }
    }
    return blobs;
  };

  // Helper: Normalize and resolve image paths, case-insensitive lookup
  function resolveImageSrc(src, basePath, blobs) {
    // Remove any leading './' or '../' from src and join with basePath
    let resolved = src;
    if (basePath && !src.match(/^([a-z]+:|\/)/i)) {
      // Remove any leading './' from src
      resolved = basePath + src.replace(/^\.\//, '');
    }
    // Try direct match
    if (blobs[resolved]) return blobs[resolved];
    // Try case-insensitive match
    const lower = resolved.toLowerCase();
    for (const key of Object.keys(blobs)) {
      if (key.toLowerCase() === lower) return blobs[key];
    }
    // Debug log
    // console.log('Image not found:', src, 'resolved as', resolved, 'basePath:', basePath);
    return null;
  }

  // Helper: Rewrite <img src> tags in HTML to use Blob URLs (improved)
  function rewriteImageSrcs(htmlString, blobs, basePath = '') {
    const parser = new DOMParser();
    let doc = parser.parseFromString(htmlString, 'text/html');
    const imgs = doc.querySelectorAll('img');
    imgs.forEach(img => {
      let src = img.getAttribute('src');
      if (!src) return;
      const blobUrl = resolveImageSrc(src, basePath, blobs);
      if (blobUrl) {
        img.setAttribute('src', blobUrl);
      } else {
        // Optionally, log missing images for debugging
        // console.warn('Missing image for src:', src, 'basePath:', basePath);
      }
    });
    return doc.body.innerHTML;
  }

  // Clean up Blob URLs when EPUB changes
  useEffect(() => {
    return () => {
      Object.values(imageBlobs).forEach(url => URL.revokeObjectURL(url));
    };
  }, [imageBlobs]);

  // Export Bionic EPUB logic (patched)
  const exportBionicEpub = async () => {
    if (!epubContent) return;
    const zip = await JSZip.loadAsync(epubContent);
    const fileNames = Object.keys(zip.files);
    const parser = new DOMParser();
    const serializer = new XMLSerializer();

    for (const fileName of fileNames) {
      if (fileName.endsWith('.xhtml') || fileName.endsWith('.html')) {
        const original = await zip.files[fileName].async('text');
        let doc;
        try {
          doc = parser.parseFromString(original, 'application/xhtml+xml');
        } catch (e) {
          continue;
        }
        const body = doc.querySelector('body');
        if (body) {
          bionicTransformDomInPlace(body);
          const newContent = serializer.serializeToString(doc);
          zip.file(fileName, newContent);
        }
      }
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (bookTitle ? bookTitle.replace(/\s+/g, '_') : 'bionic') + '_bionic.epub';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  };

  // Parse EPUB file
  const parseEpub = async (file) => {
    setIsLoadingEpub(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      setEpubContent(arrayBuffer);
      const zip = await JSZip.loadAsync(arrayBuffer);
      const blobs = await extractImageBlobs(zip);
      setImageBlobs(blobs);
      const files = {};
      const fileNames = Object.keys(zip.files);
      for (const fileName of fileNames) {
        if (!zip.files[fileName].dir) {
          files[fileName] = await zip.files[fileName].async('text');
        }
      }
      
      // Read container.xml to find the OPF file
      const containerXml = files['META-INF/container.xml'];
      if (!containerXml) throw new Error('Invalid EPUB: Missing container.xml');
      
      const parser = new DOMParser();
      const containerDoc = parser.parseFromString(containerXml, 'text/xml');
      const rootfileElement = containerDoc.querySelector('rootfile');
      if (!rootfileElement) throw new Error('Invalid EPUB: Missing rootfile');
      
      const opfPath = rootfileElement.getAttribute('full-path');
      const opfContent = files[opfPath];
      if (!opfContent) throw new Error('Invalid EPUB: Missing OPF file');
      
      // Parse OPF file
      const opfDoc = parser.parseFromString(opfContent, 'text/xml');
      
      // Get book metadata
      const titleElement = opfDoc.querySelector('title');
      const title = titleElement ? titleElement.textContent.trim() : 'Unknown Book';
      setBookTitle(title);
      
      // Get spine order and manifest
      const spineItems = Array.from(opfDoc.querySelectorAll('spine itemref'));
      const manifest = opfDoc.querySelector('manifest');
      
      if (!manifest) throw new Error('Invalid EPUB: Missing manifest');
      
      // Extract chapters in reading order
      const chapters = [];
      const basePath = opfPath.substring(0, opfPath.lastIndexOf('/') + 1);
      
      for (let i = 0; i < spineItems.length; i++) {
        const itemref = spineItems[i];
        const idref = itemref.getAttribute('idref');
        const manifestItem = manifest.querySelector(`item[id="${idref}"]`);
        
        if (manifestItem && manifestItem.getAttribute('media-type') === 'application/xhtml+xml') {
          const href = manifestItem.getAttribute('href');
          const fullPath = basePath + href;
          const chapterContent = files[fullPath];
          
          if (chapterContent) {
            try {
              const chapterDoc = parser.parseFromString(chapterContent, 'text/html');
              
              // Extract title
              let chapterTitle = chapterDoc.querySelector('title')?.textContent?.trim() || 
                               chapterDoc.querySelector('h1, h2, h3')?.textContent?.trim() || 
                               `Chapter ${i + 1}`;
              
              // Clean up title
              chapterTitle = chapterTitle.replace(/\s+/g, ' ').trim();
              
              // Extract text content
              const body = chapterDoc.querySelector('body');
              let text = '';
              if (body) {
                // Remove unwanted elements
                const unwantedElements = body.querySelectorAll('script, style, nav, header, footer');
                unwantedElements.forEach(el => el.remove());
                
                // Get text content
                text = body.textContent || body.innerText || '';
                text = text.replace(/\s+/g, ' ').replace(/\n\s*\n/g, '\n\n').trim();
              }
              
              if (text.length > 50) { // Only include chapters with substantial content
                chapters.push({
                  title: chapterTitle,
                  content: text,
                  index: i,
                  rawHtml: chapterContent,
                  basePath
                });
              }
            } catch (error) {
              console.warn(`Failed to parse chapter: ${fullPath}`, error);
            }
          }
        }
      }
      
      if (chapters.length === 0) {
        throw new Error('No readable chapters found in EPUB');
      }
      
      setChapters(chapters);
      setCurrentChapter(0);
      setIsEpubMode(true);
      setShowInput(false);
      
      // Convert first chapter to bionic (with formatting)
      const first = chapters[0];
      let firstBionic = '';
      if (first && first.rawHtml) {
        firstBionic = bionicTransformHtmlString(first.rawHtml, first.basePath);
      } else {
        firstBionic = convertToBionic(first.content);
      }
      setBionicText(firstBionic);
      setDisplayedText(firstBionic);
      setHasTransformed(true);
      
    } catch (error) {
      console.error('Error parsing EPUB:', error);
      alert(`Failed to parse EPUB file: ${error.message}\n\nPlease make sure it's a valid EPUB format.`);
    } finally {
      setIsLoadingEpub(false);
    }
  };

  // Handle file upload
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (file && file.name.toLowerCase().endsWith('.epub')) {
      parseEpub(file);
    } else {
      alert('Please select a valid EPUB file.');
    }
  };

  // Navigate chapters
  const goToChapter = (chapterIndex) => {
    if (chapterIndex >= 0 && chapterIndex < chapters.length) {
      setCurrentChapter(chapterIndex);
      // Use the original HTML for the chapter, if available
      const chapter = chapters[chapterIndex];
      if (chapter && chapter.rawHtml) {
        const bionicHtml = bionicTransformHtmlString(chapter.rawHtml, chapter.basePath);
        setBionicText(bionicHtml);
        setDisplayedText(bionicHtml);
      } else {
        // fallback to plain text
        const chapterBionic = convertToBionic(chapter.content);
        setBionicText(chapterBionic);
        setDisplayedText(chapterBionic);
      }
      setShowToc(false);
    }
  };

  const nextChapter = () => {
    if (currentChapter < chapters.length - 1) {
      goToChapter(currentChapter + 1);
    }
  };

  const previousChapter = () => {
    if (currentChapter > 0) {
      goToChapter(currentChapter - 1);
    }
  };

  // Bookmark functionality
  const toggleBookmark = () => {
    const bookmarkId = `${bookTitle}-${currentChapter}`;
    const existingBookmark = bookmarks.find(b => b.id === bookmarkId);
    
    if (existingBookmark) {
      setBookmarks(bookmarks.filter(b => b.id !== bookmarkId));
    } else {
      const newBookmark = {
        id: bookmarkId,
        bookTitle,
        chapterTitle: chapters[currentChapter]?.title,
        chapterIndex: currentChapter,
        timestamp: new Date().toISOString()
      };
      setBookmarks([...bookmarks, newBookmark]);
    }
  };

  const isBookmarked = () => {
    const bookmarkId = `${bookTitle}-${currentChapter}`;
    return bookmarks.some(b => b.id === bookmarkId);
  };

  // Regular text mode functions
  const animateText = (text) => {
    setIsTransforming(true);
    setBionicText(text);
    
    setTimeout(() => {
      setDisplayedText(text);
      setIsTransforming(false);
    }, 300);
  };

  const handleTransform = () => {
    if (!inputText.trim()) return;
    
    const converted = convertToBionic(inputText);
    setBionicText(converted);
    setHasTransformed(true);
    setShowInput(false);
    animateText(converted);
  };

  const copyBionicText = async () => {
    if (!displayedText) return;
    
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = displayedText;
    const plainText = tempDiv.textContent || tempDiv.innerText || '';
    
    try {
      await navigator.clipboard.writeText(plainText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const exitEpubMode = () => {
    setIsEpubMode(false);
    setEpubContent(null);
    setChapters([]);
    setCurrentChapter(0);
    setBookTitle('');
    setDisplayedText('');
    setBionicText('');
    setHasTransformed(false);
    setShowInput(true);
    setInputText('');
  };

  useEffect(() => {
    if (hasTransformed && inputText !== inputText) {
      setBionicText('');
      setDisplayedText('');
      setHasTransformed(false);
    }
  }, [inputText]);

  const sampleText = `Bionic reading is a reading method that highlights the beginning of words to guide your eyes and improve reading speed. This technique can help reduce cognitive load and increase comprehension by making text processing more efficient. The method works by creating visual fixation points that help your brain process text more quickly while maintaining understanding. Try pasting your own text above to experience the difference and see how this enhanced reading format can improve your reading flow!`;

  // Helper: Remove all <img> tags from HTML string
  function removeImagesFromHtml(htmlString) {
    const parser = new DOMParser();
    let doc = parser.parseFromString(htmlString, 'text/html');
    const imgs = doc.querySelectorAll('img');
    imgs.forEach(img => img.remove());
    return doc.body.innerHTML;
  }

  // In bionicTransformHtmlString, remove images after bionic transform
  function bionicTransformHtmlString(htmlString, basePath = '') {
    const parser = new DOMParser();
    let doc = parser.parseFromString(htmlString, 'application/xhtml+xml');
    let body = doc.querySelector('body');
    if (!body) {
      doc = parser.parseFromString(htmlString, 'text/html');
      body = doc.body;
    }
    if (body) {
      bionicTransformDomInPlace(body);
      // Remove images
      const htmlNoImages = removeImagesFromHtml(body.innerHTML);
      return htmlNoImages;
    }
    return htmlString;
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#fefcf8' }}>
      {/* Header */}
      <div className="border-b px-6 py-4" style={{ backgroundColor: '#fefcf8', borderColor: '#f0ede6' }}>
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: '#8b7355' }}>
              {isEpubMode ? <BookOpen className="w-4 h-4 text-white" /> : <Type className="w-4 h-4 text-white" />}
            </div>
            <div>
              <h1
                className="text-xl font-light truncate max-w-xs md:max-w-md lg:max-w-2xl"
                style={{ color: '#5a4a3a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                title={isEpubMode ? bookTitle : 'Bionic Reader'}
              >
                {isEpubMode ? bookTitle : 'Bionic Reader'}
              </h1>
              {isEpubMode && chapters.length > 0 && (
                <p className="text-xs" style={{ color: '#a0957f' }}>
                  {chapters[currentChapter]?.title} • Chapter {currentChapter + 1} of {chapters.length}
                </p>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {/* EPUB Upload Button */}
            {!isEpubMode && (
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".epub"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoadingEpub}
                  className="flex items-center gap-2 px-4 py-2 rounded-full transition-all duration-200 hover:shadow-sm"
                  style={{ 
                    backgroundColor: '#f5f1eb', 
                    color: '#6b5b4d',
                    border: '1px solid #e8e2d9'
                  }}
                >
                  {isLoadingEpub ? (
                    <>
                      <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                      Loading...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      <span className="text-sm">Import EPUB</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* EPUB Mode Controls */}
            {isEpubMode && (
              <>
                <button
                  onClick={toggleBookmark}
                  className="flex items-center gap-2 px-3 py-2 rounded-full transition-all duration-200 hover:shadow-sm"
                  style={{ 
                    backgroundColor: isBookmarked() ? '#22c55e' : '#f5f1eb', 
                    color: isBookmarked() ? 'white' : '#6b5b4d',
                    border: `1px solid ${isBookmarked() ? '#22c55e' : '#e8e2d9'}`
                  }}
                >
                  {isBookmarked() ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
                </button>

                <button
                  onClick={() => setShowToc(!showToc)}
                  className="flex items-center gap-2 px-3 py-2 rounded-full transition-all duration-200 hover:shadow-sm"
                  style={{ 
                    backgroundColor: showToc ? '#8b7355' : '#f5f1eb', 
                    color: showToc ? 'white' : '#6b5b4d',
                    border: `1px solid ${showToc ? '#8b7355' : '#e8e2d9'}`
                  }}
                >
                  <Menu className="w-4 h-4" />
                </button>

                <button
                  onClick={exitEpubMode}
                  className="flex items-center gap-2 px-3 py-2 rounded-full transition-all duration-200 hover:shadow-sm"
                  style={{ 
                    backgroundColor: '#f5f1eb', 
                    color: '#6b5b4d',
                    border: '1px solid #e8e2d9'
                  }}
                >
                  <X className="w-4 h-4" />
                </button>

                <button
                  onClick={exportBionicEpub}
                  className="flex items-center gap-2 px-3 py-2 rounded-full transition-all duration-200 hover:shadow-sm"
                  style={{ backgroundColor: '#f5f1eb', color: '#6b5b4d', border: '1px solid #e8e2d9' }}
                >
                  <Upload className="w-4 h-4" />
                  <span className="text-sm">Export Bionic EPUB</span>
                </button>
              </>
            )}
            
            {displayedText && (
              <>
                {/* Font Size Control */}
                <div className="flex items-center gap-2 px-3 py-2 rounded-full" style={{ backgroundColor: '#f5f1eb', border: '1px solid #e8e2d9' }}>
                  <button
                    onClick={() => setFontSize(Math.max(12, fontSize - 2))}
                    className="w-6 h-6 rounded-full flex items-center justify-center transition-all duration-200 hover:bg-white"
                    style={{ color: '#6b5b4d' }}
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  
                  <div className="flex items-center gap-2 px-2">
                    <Type className="w-3 h-3" style={{ color: '#a0957f' }} />
                    <span className="text-xs font-medium min-w-[2rem] text-center" style={{ color: '#6b5b4d' }}>
                      {fontSize}px
                    </span>
                  </div>
                  
                  <button
                    onClick={() => setFontSize(Math.min(36, fontSize + 2))}
                    className="w-6 h-6 rounded-full flex items-center justify-center transition-all duration-200 hover:bg-white"
                    style={{ color: '#6b5b4d' }}
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>

                <button
                  onClick={copyBionicText}
                  className="flex items-center gap-2 px-4 py-2 rounded-full transition-all duration-200 hover:shadow-sm"
                  style={{ 
                    backgroundColor: copied ? '#22c55e' : '#f5f1eb', 
                    color: copied ? 'white' : '#6b5b4d',
                    border: `1px solid ${copied ? '#22c55e' : '#e8e2d9'}`
                  }}
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span className="text-sm">{copied ? 'Copied!' : 'Copy'}</span>
                </button>
              </>
            )}
            
            {!isEpubMode && (
              <button
                onClick={() => setShowInput(!showInput)}
                className="flex items-center gap-2 px-4 py-2 rounded-full transition-all duration-200 hover:shadow-sm"
                style={{ 
                  backgroundColor: '#f5f1eb', 
                  color: '#6b5b4d',
                  border: '1px solid #e8e2d9'
                }}
              >
                {showInput ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                <span className="text-sm">{showInput ? 'Focus' : 'Edit'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 max-w-6xl mx-auto w-full p-6 relative">
        {/* Table of Contents Sidebar */}
        {showToc && isEpubMode && (
          <div className="fixed inset-y-0 left-0 w-80 z-50 p-6 overflow-y-auto" style={{ backgroundColor: '#faf8f4', borderRight: '1px solid #f0ede6' }}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-light text-lg" style={{ color: '#5a4a3a' }}>Table of Contents</h3>
              <button
                onClick={() => setShowToc(false)}
                className="p-2 rounded-full hover:bg-white"
                style={{ color: '#6b5b4d' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2">
              {chapters.map((chapter, index) => (
                <button
                  key={index}
                  onClick={() => goToChapter(index)}
                  className={`w-full text-left p-3 rounded-lg transition-all duration-200 ${
                    index === currentChapter ? 'shadow-sm' : 'hover:bg-white'
                  }`}
                  style={{ 
                    backgroundColor: index === currentChapter ? '#8b7355' : 'transparent',
                    color: index === currentChapter ? 'white' : '#6b5b4d'
                  }}
                >
                  <div className="text-sm font-medium truncate">
                    {chapter.title}
                  </div>
                  <div className="text-xs opacity-70 mt-1">
                    Chapter {index + 1}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className={`grid gap-6 h-full transition-all duration-300 ${showToc ? 'ml-80' : ''}`} style={{ gridTemplateColumns: showInput ? '1fr 1fr' : '1fr' }}>
          
          {/* Input Panel */}
          {showInput && !isEpubMode && (
            <div className="rounded-2xl" style={{ backgroundColor: '#faf8f4', border: '1px solid #f0ede6' }}>
              <div className="p-6" style={{ borderBottom: '1px solid #f0ede6' }}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2" style={{ color: '#6b5b4d' }}>
                    <FileText className="w-4 h-4" />
                    <h2 className="font-light text-sm">Your Content</h2>
                  </div>
                </div>
              </div>
              <div className="p-8">
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Paste or type your text here..."
                  className="w-full h-80 p-6 rounded-xl resize-none focus:outline-none leading-relaxed placeholder-opacity-60"
                  style={{ 
                    backgroundColor: '#ffffff',
                    border: '1px solid #f0ede6',
                    color: '#5a4a3a',
                    boxShadow: '0 1px 3px rgba(139, 115, 85, 0.05)',
                    fontSize: '16px'
                  }}
                />
                <div className="mt-6 flex gap-3">
                  {!inputText && (
                    <button
                      onClick={() => setInputText(sampleText)}
                      className="px-4 py-2 text-sm rounded-full transition-all duration-200 hover:shadow-sm"
                      style={{ 
                        backgroundColor: '#f5f1eb',
                        color: '#6b5b4d',
                        border: '1px solid #e8e2d9'
                      }}
                    >
                      Try Sample
                    </button>
                  )}
                  
                  {inputText && (
                    <button
                      onClick={handleTransform}
                      disabled={isTransforming}
                      className="flex items-center gap-2 px-6 py-2 text-sm rounded-full transition-all duration-200 hover:shadow-sm disabled:opacity-50"
                      style={{ 
                        backgroundColor: '#8b7355',
                        color: 'white'
                      }}
                    >
                      {isTransforming ? (
                        <>
                          <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          Converting...
                        </>
                      ) : (
                        <>
                          <Zap className="w-3 h-3" />
                          Convert
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Reading Panel */}
          <div className="rounded-2xl relative" style={{ backgroundColor: '#faf8f4', border: '1px solid #f0ede6' }}>
            {/* Chapter Navigation (moved to top) */}
            {isEpubMode && chapters.length > 0 && (
              <div className="border-b px-8 py-4 flex items-center justify-between" style={{ borderColor: '#f0ede6' }}>
                <button
                  onClick={previousChapter}
                  disabled={currentChapter === 0}
                  className="flex items-center gap-2 px-4 py-2 rounded-full transition-all duration-200 hover:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ 
                    backgroundColor: '#f5f1eb',
                    color: '#6b5b4d',
                    border: '1px solid #e8e2d9'
                  }}
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span className="text-sm">Previous</span>
                </button>

                <div className="text-center">
                  <div className="text-sm font-medium" style={{ color: '#6b5b4d' }}>
                    {currentChapter + 1} of {chapters.length}
                  </div>
                  <div className="text-xs" style={{ color: '#a0957f' }}>
                    {Math.round(((currentChapter + 1) / chapters.length) * 100)}% complete
                  </div>
                </div>

                <button
                  onClick={nextChapter}
                  disabled={currentChapter === chapters.length - 1}
                  className="flex items-center gap-2 px-4 py-2 rounded-full transition-all duration-200 hover:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ 
                    backgroundColor: '#f5f1eb',
                    color: '#6b5b4d',
                    border: '1px solid #e8e2d9'
                  }}
                >
                  <span className="text-sm">Next</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
            <div className="p-8">
              {displayedText ? (
                <div 
                  className="leading-loose font-light tracking-wide animate-in fade-in duration-500"
                  style={{ 
                    color: '#5a4a3a',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, "Inter", system-ui, sans-serif',
                    lineHeight: '1.7',
                    fontSize: `${fontSize}px`
                  }}
                  dangerouslySetInnerHTML={{ __html: displayedText }}
                />
              ) : bionicText ? (
                <div 
                  className="leading-loose font-light tracking-wide"
                  style={{ 
                    color: '#5a4a3a',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, "Inter", system-ui, sans-serif',
                    lineHeight: '1.7',
                    fontSize: `${fontSize}px`
                  }}
                  dangerouslySetInnerHTML={{ __html: bionicText }}
                />
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: '#f0ede6' }}>
                    <Type className="w-6 h-6" style={{ color: '#a0957f' }} />
                  </div>
                  <p className="mb-1 text-lg font-light" style={{ color: '#8b7355' }}>Ready to read</p>
                  <p className="text-sm mb-4" style={{ color: '#a0957f' }}>Add your text or import an EPUB to begin</p>
                  
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 px-6 py-3 rounded-full transition-all duration-200 hover:shadow-sm"
                    style={{ 
                      backgroundColor: '#8b7355',
                      color: 'white'
                    }}
                  >
                    <BookOpen className="w-4 h-4" />
                    Import EPUB Book
                  </button>
                </div>
              )}
              
              {isTransforming && (
                <div className="absolute bottom-6 right-6">
                  <div className="flex items-center gap-2 px-3 py-2 rounded-full text-sm" style={{ backgroundColor: '#8b7355', color: 'white' }}>
                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Converting...
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 py-4" style={{ backgroundColor: '#f5f1eb', borderTop: '1px solid #f0ede6' }}>
        <div className="max-w-6xl mx-auto text-center text-sm" style={{ color: '#8b7355' }}>
          Enhanced reading through subtle text emphasis {isEpubMode && '• Now reading full books with EPUB support'}
        </div>
      </div>
    </div>
  );
};

export default BionicReader; 
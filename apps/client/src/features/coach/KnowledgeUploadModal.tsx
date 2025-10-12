import { useState } from 'react';

interface KnowledgeUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type UploadTab = 'youtube' | 'pdf' | 'text';

export function KnowledgeUploadModal({ isOpen, onClose }: KnowledgeUploadModalProps) {
  const [activeTab, setActiveTab] = useState<UploadTab>('youtube');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // YouTube state
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [youtubeTitle, setYoutubeTitle] = useState('');

  // PDF state
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfTitle, setPdfTitle] = useState('');

  // Text state
  const [textContent, setTextContent] = useState('');
  const [textTitle, setTextTitle] = useState('');

  if (!isOpen) return null;

  const resetForm = () => {
    setYoutubeUrl('');
    setYoutubeTitle('');
    setPdfFile(null);
    setPdfTitle('');
    setTextContent('');
    setTextTitle('');
    setError(null);
    setSuccess(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const isValidYouTubeUrl = (url: string): boolean => {
    // Accept youtube.com/watch, youtu.be, and youtube.com/embed URLs with any query params
    const patterns = [
      /^(https?:\/\/)?(www\.)?youtube\.com\/watch\?.*v=[a-zA-Z0-9_-]+/,  // youtube.com/watch?v=...
      /^(https?:\/\/)?(www\.)?youtu\.be\/[a-zA-Z0-9_-]+/,                 // youtu.be/...
      /^(https?:\/\/)?(www\.)?youtube\.com\/embed\/[a-zA-Z0-9_-]+/,       // youtube.com/embed/...
      /^(https?:\/\/)?(www\.)?youtube\.com\/shorts\/[a-zA-Z0-9_-]+/,      // youtube.com/shorts/...
    ];
    return patterns.some((pattern) => pattern.test(url));
  };

  const handleYoutubeUpload = async () => {
    if (!youtubeUrl.trim()) {
      setError('Please enter a YouTube URL');
      return;
    }

    if (!isValidYouTubeUrl(youtubeUrl)) {
      setError('Please enter a valid YouTube URL');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/nexa/upload/youtube', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          url: youtubeUrl,
          title: youtubeTitle || undefined,
          tags: ['youtube'],
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Upload failed');
      }

      const data = await response.json();
      setSuccess(`✅ Uploaded! Created ${data.chunksCreated} knowledge chunks`);
      setTimeout(() => {
        resetForm();
        handleClose();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePdfUpload = async () => {
    if (!pdfFile) {
      setError('Please select a PDF file');
      return;
    }

    // Enforce 10MB limit
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (pdfFile.size > maxSize) {
      setError(`File too large. Maximum size is 10MB (${(pdfFile.size / 1024 / 1024).toFixed(2)}MB provided)`);
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const formData = new FormData();
      formData.append('file', pdfFile);
      if (pdfTitle) formData.append('title', pdfTitle);
      formData.append('tags', JSON.stringify(['pdf']));

      const response = await fetch('/api/nexa/upload/pdf', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Upload failed');
      }

      const data = await response.json();
      setSuccess(`✅ Uploaded! Created ${data.chunksCreated} knowledge chunks`);
      setTimeout(() => {
        resetForm();
        handleClose();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTextUpload = async () => {
    if (!textContent.trim()) {
      setError('Please enter some text');
      return;
    }

    if (textContent.length < 50) {
      setError('Text must be at least 50 characters');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/nexa/upload/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          text: textContent,
          title: textTitle || 'Text Note',
          tags: ['notes'],
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Upload failed');
      }

      const data = await response.json();
      setSuccess(`✅ Uploaded! Created ${data.chunksCreated} knowledge chunks`);
      setTimeout(() => {
        resetForm();
        handleClose();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    const pdfFile = files.find((f) => f.type === 'application/pdf');
    
    if (pdfFile) {
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (pdfFile.size > maxSize) {
        setError(`File too large. Maximum size is 10MB (${(pdfFile.size / 1024 / 1024).toFixed(2)}MB provided)`);
        return;
      }
      setPdfFile(pdfFile);
      setActiveTab('pdf');
      setError(null);
    } else {
      setError('Please drop a PDF file');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div
        className="relative w-full max-w-2xl bg-gray-900 border border-gray-700 rounded-lg shadow-2xl"
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white">Teach Nexa</h2>
          <button
            onClick={handleClose}
            className="p-1 text-gray-400 transition-colors rounded hover:text-white hover:bg-gray-800"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-4 border-b border-gray-700 bg-gray-800/50">
          <button
            onClick={() => setActiveTab('youtube')}
            className={`px-4 py-2 text-sm font-medium rounded transition-colors ${
              activeTab === 'youtube'
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
          >
            📺 YouTube
          </button>
          <button
            onClick={() => setActiveTab('pdf')}
            className={`px-4 py-2 text-sm font-medium rounded transition-colors ${
              activeTab === 'pdf'
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
          >
            📄 PDF
          </button>
          <button
            onClick={() => setActiveTab('text')}
            className={`px-4 py-2 text-sm font-medium rounded transition-colors ${
              activeTab === 'text'
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
          >
            📝 Text
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* YouTube Tab */}
          {activeTab === 'youtube' && (
            <div className="space-y-4">
              <div>
                <label className="block mb-2 text-sm font-medium text-gray-300">
                  YouTube URL
                </label>
                <input
                  type="url"
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  placeholder="https://youtube.com/watch?v=..."
                  className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block mb-2 text-sm font-medium text-gray-300">
                  Title (optional)
                </label>
                <input
                  type="text"
                  value={youtubeTitle}
                  onChange={(e) => setYoutubeTitle(e.target.value)}
                  placeholder="My Trading Strategy"
                  className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded focus:outline-none focus:border-blue-500"
                />
              </div>
              <button
                onClick={handleYoutubeUpload}
                disabled={isLoading}
                className="w-full px-4 py-2 text-sm font-medium text-white transition-colors bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Processing...' : 'Upload Video'}
              </button>
            </div>
          )}

          {/* PDF Tab */}
          {activeTab === 'pdf' && (
            <div className="space-y-4">
              <div>
                <label className="block mb-2 text-sm font-medium text-gray-300">
                  PDF File
                </label>
                <div className="relative">
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
                    className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded focus:outline-none focus:border-blue-500"
                  />
                  {pdfFile && (
                    <div className="mt-2 text-xs text-gray-400">
                      Selected: {pdfFile.name} ({(pdfFile.size / 1024 / 1024).toFixed(2)} MB)
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="block mb-2 text-sm font-medium text-gray-300">
                  Title (optional)
                </label>
                <input
                  type="text"
                  value={pdfTitle}
                  onChange={(e) => setPdfTitle(e.target.value)}
                  placeholder="Trading Playbook"
                  className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded focus:outline-none focus:border-blue-500"
                />
              </div>
              <button
                onClick={handlePdfUpload}
                disabled={isLoading}
                className="w-full px-4 py-2 text-sm font-medium text-white transition-colors bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Processing...' : 'Upload PDF'}
              </button>
            </div>
          )}

          {/* Text Tab */}
          {activeTab === 'text' && (
            <div className="space-y-4">
              <div>
                <label className="block mb-2 text-sm font-medium text-gray-300">
                  Title
                </label>
                <input
                  type="text"
                  value={textTitle}
                  onChange={(e) => setTextTitle(e.target.value)}
                  placeholder="My Trading Rules"
                  className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block mb-2 text-sm font-medium text-gray-300">
                  Content (min 50 characters)
                </label>
                <textarea
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  placeholder="Enter your trading strategies, setups, risk rules..."
                  rows={8}
                  className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded focus:outline-none focus:border-blue-500 resize-none"
                />
                <div className="mt-1 text-xs text-gray-400">
                  {textContent.length} characters
                </div>
              </div>
              <button
                onClick={handleTextUpload}
                disabled={isLoading}
                className="w-full px-4 py-2 text-sm font-medium text-white transition-colors bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Processing...' : 'Upload Text'}
              </button>
            </div>
          )}

          {/* Status Messages */}
          {error && (
            <div className="p-3 mt-4 text-sm text-red-400 bg-red-900/30 border border-red-700 rounded">
              {error}
            </div>
          )}
          {success && (
            <div className="p-3 mt-4 text-sm text-green-400 bg-green-900/30 border border-green-700 rounded">
              {success}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 text-xs text-center text-gray-500 border-t border-gray-700">
          Drag & drop PDF files anywhere on this window
        </div>
      </div>
    </div>
  );
}

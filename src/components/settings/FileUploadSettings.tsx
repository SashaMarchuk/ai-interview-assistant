/**
 * File Upload Settings Component
 *
 * Provides UI for uploading resume (PDF/TXT) and pasting job description
 * for LLM prompt personalization. Files are stored in IndexedDB and
 * injected into system prompts via PromptBuilder.
 */

import { useState, useEffect, useRef } from 'react';
import {
  saveFileContent,
  getFileContent,
  deleteFileContent,
  extractTextFromPDF,
} from '../../services/fileStorage';

/** Maximum character limit for resume text */
const MAX_RESUME_CHARS = 8_000;
/** Maximum character limit for job description text */
const MAX_JD_CHARS = 4_000;
/** Minimum extracted text length to consider valid (avoids scanned PDFs) */
const MIN_EXTRACT_CHARS = 50;

export function FileUploadSettings() {
  const [resumeStatus, setResumeStatus] = useState('');
  const [resumePreview, setResumePreview] = useState('');
  const [jdText, setJdText] = useState('');
  const [jdSaved, setJdSaved] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [hasResume, setHasResume] = useState(false);
  const [hasJD, setHasJD] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load existing records on mount
  useEffect(() => {
    async function loadExisting() {
      try {
        const resumeRecord = await getFileContent('resume');
        if (resumeRecord) {
          const charCount = resumeRecord.text.length;
          const fileName = resumeRecord.fileName ?? 'Resume';
          setResumeStatus(`${fileName} (${charCount.toLocaleString()} chars)`);
          setResumePreview(resumeRecord.text.slice(0, 200));
          setHasResume(true);
        }

        const jdRecord = await getFileContent('jobDescription');
        if (jdRecord) {
          setJdText(jdRecord.text);
          setHasJD(true);
        }
      } catch (error) {
        console.error('Failed to load file records:', error);
      }
    }
    loadExisting();
  }, []);

  async function handleResumeUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsExtracting(true);
    setResumeStatus('');
    setResumePreview('');

    try {
      let text: string;
      if (file.name.toLowerCase().endsWith('.pdf')) {
        text = await extractTextFromPDF(file);
      } else {
        text = await file.text();
      }

      if (text.trim().length < MIN_EXTRACT_CHARS) {
        setResumeStatus(
          'Very little text extracted. This may be a scanned PDF. Try a text-based PDF or paste resume content directly.',
        );
        setIsExtracting(false);
        return;
      }

      const truncatedText = text.slice(0, MAX_RESUME_CHARS);

      await saveFileContent({
        type: 'resume',
        text: truncatedText,
        fileName: file.name,
        updatedAt: Date.now(),
      });

      setResumeStatus(`${file.name} (${truncatedText.length.toLocaleString()} chars)`);
      setResumePreview(truncatedText.slice(0, 200));
      setHasResume(true);
    } catch (error) {
      console.error('Resume extraction error:', error);
      setResumeStatus('Error extracting text from file');
    } finally {
      setIsExtracting(false);
    }
  }

  async function handleResumeDelete() {
    await deleteFileContent('resume');
    setResumeStatus('');
    setResumePreview('');
    setHasResume(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  async function handleJdSave() {
    if (!jdText.trim()) {
      await deleteFileContent('jobDescription');
      setHasJD(false);
      return;
    }

    const truncatedJd = jdText.slice(0, MAX_JD_CHARS);

    await saveFileContent({
      type: 'jobDescription',
      text: truncatedJd,
      updatedAt: Date.now(),
    });

    setHasJD(true);
    setJdSaved(true);
    setTimeout(() => setJdSaved(false), 2000);
  }

  async function handleJdDelete() {
    await deleteFileContent('jobDescription');
    setJdText('');
    setHasJD(false);
  }

  const isWarning =
    resumeStatus.includes('Very little text') || resumeStatus.includes('Error');

  return (
    <div className="space-y-4">
      {/* Resume Section */}
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-700">
          Resume <span className="text-gray-400">(PDF, TXT)</span>
        </label>
        <input
          type="file"
          accept=".pdf,.txt"
          onChange={handleResumeUpload}
          ref={fileInputRef}
          className="w-full text-xs text-gray-500 file:mr-2 file:rounded file:border-0 file:bg-gray-100 file:px-3 file:py-1 file:text-xs file:font-medium file:text-gray-700 hover:file:bg-gray-200"
        />

        {isExtracting && (
          <p className="mt-1 text-xs text-blue-500">Extracting text...</p>
        )}

        {resumeStatus && !isExtracting && (
          <p
            className={`mt-1 text-xs ${
              isWarning ? 'text-yellow-600' : 'text-green-600'
            }`}
          >
            {resumeStatus}
          </p>
        )}

        {resumePreview && !isExtracting && (
          <div className="mt-1 max-h-20 overflow-y-auto rounded bg-gray-50 p-2 text-xs text-gray-500">
            {resumePreview}...
          </div>
        )}

        {hasResume && (
          <button
            onClick={handleResumeDelete}
            className="mt-1 text-xs text-red-500 hover:text-red-700"
          >
            Delete resume
          </button>
        )}
      </div>

      {/* Job Description Section */}
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-700">
          Job Description
        </label>
        <textarea
          value={jdText}
          onChange={(e) => setJdText(e.target.value)}
          rows={4}
          maxLength={MAX_JD_CHARS}
          className="w-full rounded border border-gray-300 p-2 text-xs text-gray-700 placeholder-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
          placeholder="Paste job description here..."
        />
        <div className="mt-1 flex items-center gap-2">
          <span className="text-xs text-gray-400">
            {jdText.length}/{MAX_JD_CHARS}
          </span>
          <button
            onClick={handleJdSave}
            className="rounded bg-blue-500 px-3 py-1 text-xs font-medium text-white hover:bg-blue-600"
          >
            Save
          </button>
          {jdSaved && <span className="text-xs text-green-600">Saved!</span>}
          {hasJD && (
            <button
              onClick={handleJdDelete}
              className="text-xs text-red-500 hover:text-red-700"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default FileUploadSettings;

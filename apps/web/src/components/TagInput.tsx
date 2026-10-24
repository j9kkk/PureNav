import { useState, useRef, useEffect, useMemo } from 'react';

interface TagInputProps {
  id?: string;
  value: string; // Comma-separated or array
  onChange: (value: string) => void;
  availableTags?: string[];
  placeholder?: string;
}

export function TagInput({ id, value, onChange, availableTags = [], placeholder = '输入标签后按回车…' }: TagInputProps) {
  const [inputVal, setInputVal] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const tags = useMemo(() => {
    return value
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
  }, [value]);

  const setTags = (newTags: string[]) => {
    onChange(newTags.join(', '));
  };

  const addTag = (raw: string) => {
    const trimmed = raw.trim().replace(/^,+|,+$/g, '');
    if (!trimmed) return;
    if (!tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
    }
    setInputVal('');
    setHighlightIdx(-1);
  };

  const removeTag = (indexToRemove: number) => {
    setTags(tags.filter((_, i) => i !== indexToRemove));
  };

  const suggestions = useMemo(() => {
    const query = inputVal.trim().toLowerCase();
    return availableTags.filter((tag) => {
      const match = !query || tag.toLowerCase().includes(query);
      return match && !tags.includes(tag);
    });
  }, [availableTags, inputVal, tags]);

  // Click outside to close suggestion dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (isOpen && highlightIdx >= 0 && highlightIdx < suggestions.length) {
        addTag(suggestions[highlightIdx]!);
      } else if (inputVal.trim()) {
        addTag(inputVal);
      }
    } else if (e.key === ',' || e.key === '，') {
      e.preventDefault();
      if (inputVal.trim()) {
        addTag(inputVal);
      }
    } else if (e.key === 'Backspace' && !inputVal && tags.length > 0) {
      removeTag(tags.length - 1);
    } else if (e.key === 'ArrowDown') {
      if (!isOpen && suggestions.length > 0) {
        setIsOpen(true);
        setHighlightIdx(0);
        return;
      }
      e.preventDefault();
      setHighlightIdx((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div className="capsule-tag-input-container" ref={containerRef}>
      <div
        className="capsule-tag-box"
        onClick={() => inputRef.current?.focus()}
      >
        {tags.map((tag, idx) => (
          <span key={tag} className="capsule-tag-item">
            <span className="capsule-tag-text">{tag}</span>
            <button
              type="button"
              className="capsule-tag-remove"
              onClick={(e) => {
                e.stopPropagation();
                removeTag(idx);
              }}
              title="删除标签"
              aria-label={`删除标签 ${tag}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={id}
          className="capsule-tag-field"
          type="text"
          value={inputVal}
          placeholder={tags.length === 0 ? placeholder : ''}
          onChange={(e) => {
            setInputVal(e.target.value);
            setIsOpen(true);
            setHighlightIdx(-1);
          }}
          onFocus={() => {
            if (suggestions.length > 0) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
        />
      </div>

      {isOpen && suggestions.length > 0 && (
        <div className="capsule-tag-dropdown">
          <div className="capsule-tag-dropdown-header">已有标签建议</div>
          <div className="capsule-tag-dropdown-list">
            {suggestions.slice(0, 8).map((suggestion, idx) => (
              <button
                key={suggestion}
                type="button"
                className={`capsule-tag-suggestion ${idx === highlightIdx ? 'is-active' : ''}`}
                onMouseEnter={() => setHighlightIdx(idx)}
                onClick={() => {
                  addTag(suggestion);
                  inputRef.current?.focus();
                }}
              >
                <span className="suggestion-bullet">#</span>
                <span className="suggestion-name">{suggestion}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

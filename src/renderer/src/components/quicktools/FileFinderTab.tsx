import React, { useState } from 'react';
import { Search, File, Calendar, HardDrive, Copy, Check, Filter } from 'lucide-react';
import { FileSearchResult, FileSearchResultItem } from '@/shared/types';

const COMMON_EXTS = ['All', 'pdf', 'docx', 'txt', 'png', 'ts', 'js', 'json', 'zip'];

export const FileFinderTab: React.FC = () => {
  const [query, setQuery] = useState('');
  const [selectedExt, setSelectedExt] = useState('All');
  const [searchContent, setSearchContent] = useState(false);
  const [daysFilter, setDaysFilter] = useState<number | undefined>(undefined);
  const [searchResults, setSearchResults] = useState<FileSearchResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!query.trim() && selectedExt === 'All') return;
    if (!window.fridayAPI) return;

    setIsSearching(true);
    try {
      const res = await window.fridayAPI.quickToolsSearchFiles({
        query: query.trim(),
        extension: selectedExt === 'All' ? undefined : selectedExt,
        searchContent,
        modifiedWithinDays: daysFilter,
      });
      setSearchResults(res);
    } catch (err) {
      console.error('File search failed:', err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleCopyPath = (filePath: string) => {
    if (!window.fridayAPI) return;
    window.fridayAPI.quickToolsCopyClipboardItem(filePath);
    setCopiedPath(filePath);
    setTimeout(() => setCopiedPath(null), 1800);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Search Input Box */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 14px',
          borderRadius: '10px',
          background: 'color-mix(in srgb, var(--surface) 50%, transparent)',
          border: '1px solid var(--border)',
        }}
      >
        <Search size={16} style={{ color: 'var(--muted)' }} />
        <input
          type="text"
          placeholder="Search by file name or keywords (e.g. invoice, report, project)..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--text)',
            fontSize: '0.85rem',
          }}
        />
        <button
          onClick={handleSearch}
          disabled={isSearching}
          style={{
            padding: '6px 16px',
            borderRadius: '6px',
            background: 'var(--accent)',
            border: 'none',
            color: '#fff',
            fontSize: '0.8rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {isSearching ? 'Searching...' : 'Search'}
        </button>
      </div>

      {/* Filter Row: Extensions & Options */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Filter size={12} /> Format:
          </span>
          {COMMON_EXTS.map((ext) => (
            <button
              key={ext}
              onClick={() => setSelectedExt(ext)}
              style={{
                padding: '3px 10px',
                borderRadius: '12px',
                fontSize: '0.72rem',
                fontWeight: 500,
                cursor: 'pointer',
                border: selectedExt === ext ? '1px solid var(--accent)' : '1px solid var(--border)',
                background: selectedExt === ext ? 'color-mix(in srgb, var(--accent) 20%, transparent)' : 'transparent',
                color: selectedExt === ext ? 'var(--accent)' : 'var(--muted)',
              }}
            >
              {ext === 'All' ? 'All Types' : `.${ext}`}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={searchContent}
              onChange={(e) => setSearchContent(e.target.checked)}
            />
            Search inside file contents (text & code)
          </label>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Modified:</span>
            <select
              value={daysFilter || ''}
              onChange={(e) => setDaysFilter(e.target.value ? Number(e.target.value) : undefined)}
              style={{
                padding: '4px 8px',
                borderRadius: '6px',
                background: 'color-mix(in srgb, var(--surface) 60%, transparent)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
                fontSize: '0.75rem',
              }}
            >
              <option value="">Any time</option>
              <option value="1">Past 24 hours</option>
              <option value="7">Past 7 days</option>
              <option value="30">Past 30 days</option>
              <option value="90">Past 90 days</option>
            </select>
          </div>
        </div>
      </div>

      {/* Results Section */}
      {searchResults && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
            Found {searchResults.totalMatches} file(s) across {searchResults.scannedCount} scanned items:
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '340px', overflowY: 'auto' }}>
            {searchResults.results.length === 0 ? (
              <div style={{ padding: '28px', textAlign: 'center', color: 'var(--muted)', fontSize: '0.82rem' }}>
                No matching files found. Try widening your search query or removing filters.
              </div>
            ) : (
              searchResults.results.map((file, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '10px 14px',
                    borderRadius: '8px',
                    background: 'color-mix(in srgb, var(--surface) 50%, transparent)',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                      <File size={15} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                      <span style={{ fontSize: '0.85rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {file.fileName}
                      </span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
                        {file.sizeFormatted}
                      </span>
                    </div>

                    <button
                      onClick={() => handleCopyPath(file.filePath)}
                      title="Copy full file path to clipboard"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        background: 'transparent',
                        border: '1px solid var(--border)',
                        borderRadius: '6px',
                        padding: '4px 8px',
                        fontSize: '0.72rem',
                        color: copiedPath === file.filePath ? 'var(--success, #22c55e)' : 'var(--muted)',
                        cursor: 'pointer',
                      }}
                    >
                      {copiedPath === file.filePath ? <Check size={12} /> : <Copy size={12} />}
                      {copiedPath === file.filePath ? 'Copied' : 'Copy Path'}
                    </button>
                  </div>

                  <div style={{ fontSize: '0.72rem', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {file.filePath}
                  </div>

                  {file.previewSnippet && (
                    <div
                      style={{
                        fontSize: '0.75rem',
                        color: 'var(--text)',
                        background: 'color-mix(in srgb, var(--surface) 30%, transparent)',
                        padding: '6px 8px',
                        borderRadius: '4px',
                        fontFamily: 'monospace',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {file.previewSnippet}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

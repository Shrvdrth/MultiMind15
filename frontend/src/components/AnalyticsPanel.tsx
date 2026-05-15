import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  ResponsiveContainer, Tooltip, Legend,
} from 'recharts';
import type { DebateRoundDto } from '../api/debate';

// ── Dimension keyword scoring ────────────────────────────────
const DIMS: Record<string, string[]> = {
  Strategy:  ['strateg', 'long-term', 'competitive', 'market', 'business', 'opportunit', 'growth', 'vision', 'stakeholder', 'objectiv', 'align'],
  Risk:      ['risk', 'threat', 'vulnerab', 'concern', 'problem', 'challeng', 'failure', 'downside', 'mitigat', 'uncertain', 'issue'],
  Technical: ['implement', 'architect', 'performanc', 'scalab', 'integrat', 'infrastructur', 'code', 'deploy', 'system', 'technical', 'api', 'database'],
  Innovation:['innovat', 'novel', 'modern', 'transform', 'disrupt', 'creative', 'future', 'new approach', 'cutting', 'automat'],
  Depth:     [], // proxy: word count
};

function scoreAgent(text: string): Record<string, number> {
  const lower = text.toLowerCase();
  const wordCount = lower.split(/\s+/).length;
  return {
    Strategy:   Math.min(100, DIMS.Strategy.filter(k => lower.includes(k)).length * 11 + 25),
    Risk:       Math.min(100, DIMS.Risk.filter(k => lower.includes(k)).length * 11 + 25),
    Technical:  Math.min(100, DIMS.Technical.filter(k => lower.includes(k)).length * 10 + 25),
    Innovation: Math.min(100, DIMS.Innovation.filter(k => lower.includes(k)).length * 14 + 20),
    Depth:      Math.min(100, Math.round(wordCount / 4)),
  };
}

const AGENT_COLORS: Record<string, string> = {
  Strategist:  '#6366f1',
  RiskAnalyst: '#f87171',
  Engineer:    '#34d399',
};

const AGENT_DISPLAY: Record<string, string> = {
  Strategist:  'Strategist',
  RiskAnalyst: 'Risk Analyst',
  Engineer:    'Engineer',
};

// ── Sentiment keywords ────────────────────────────────────────
const POSITIVE_KW = ['benefit','advantage','strong','improve','success','opportunit','growth','innovat','efficient','recommend','positive','effective','valuable','enhance','robust'];
const NEGATIVE_KW = ['risk','concern','problem','fail','issue','challeng','threat','vulnerab','uncertain','difficult','complex','downside','obstacle','limit','deficit'];

function analyzeSentiment(text: string) {
  const lower = text.toLowerCase();
  const pos = POSITIVE_KW.filter(k => lower.includes(k)).length;
  const neg = NEGATIVE_KW.filter(k => lower.includes(k)).length;
  const total = pos + neg || 1;
  return { pos, neg, posRatio: Math.round((pos / total) * 100) };
}

// ── Readability (Flesch-Kincaid approximation) ────────────────
function countSyllables(word: string): number {
  word = word.toLowerCase().replace(/[^a-z]/g, '');
  if (word.length <= 3) return 1;
  const matches = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g);
  return matches ? matches.length : 1;
}

function readabilityScore(text: string): number {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0).length || 1;
  const words = text.trim().split(/\s+/).filter(w => w.length > 0);
  const wordCount = words.length || 1;
  const syllableCount = words.reduce((sum, w) => sum + countSyllables(w), 0);
  const fk = 206.835 - 1.015 * (wordCount / sentences) - 84.6 * (syllableCount / wordCount);
  return Math.max(0, Math.min(100, Math.round(fk)));
}

function readabilityLabel(score: number): string {
  if (score >= 70) return 'Easy';
  if (score >= 50) return 'Moderate';
  if (score >= 30) return 'Difficult';
  return 'Very Difficult';
}

// ── Vocabulary richness (lexical diversity) ───────────────────
function lexicalDiversity(text: string): number {
  const words = text.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length > 2);
  if (words.length === 0) return 0;
  const unique = new Set(words).size;
  return Math.round((unique / words.length) * 100);
}

// ── Jaccard agreement score ───────────────────────────────────
function keywordSet(text: string): Set<string> {
  return new Set(
    text.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length > 4)
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  const intersection = [...a].filter(x => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : Math.round((intersection / union) * 100);
}

// ── Key themes extraction ────────────────────────────────────
const STOP_WORDS = new Set(['the','a','an','and','or','but','in','on','at','to','for','of','with','by','from','up','about','into','through','during','before','after','is','are','was','were','be','been','being','have','has','had','do','does','did','will','would','could','should','may','might','must','shall','that','this','these','those','it','its','we','our','you','your','they','their','what','which','who','when','where','how','as','if','then','than','so','also','both','each','all','more','most','such','any','no','not','only','same','other','need','consider','ensure','review','help','use','make','take','work','provide','offer','allow','support','include','become']);

function extractThemes(text: string): string[] {
  const words = text.toLowerCase().replace(/[^a-z\s-]/g, '').split(/\s+/);
  const freq: Record<string, number> = {};
  for (const w of words) {
    if (w.length > 4 && !STOP_WORDS.has(w)) freq[w] = (freq[w] || 0) + 1;
  }
  return Object.entries(freq)
    .filter(([, c]) => c >= 2)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 14)
    .map(([w]) => w);
}

// ── Component ────────────────────────────────────────────────
interface Props {
  rounds: DebateRoundDto[];
  synthesisText?: string;
}

export default function AnalyticsPanel({ rounds, synthesisText }: Props) {
  // Aggregate all responses per agent
  const agentTexts: Record<string, string> = {};
  for (const round of rounds) {
    for (const r of round.responses) {
      agentTexts[r.agentType] = (agentTexts[r.agentType] || '') + ' ' + r.responseText;
    }
  }

  // Build radar data
  const dims = ['Strategy', 'Risk', 'Technical', 'Innovation', 'Depth'];
  const radarData = dims.map((dim) => {
    const row: Record<string, string | number> = { dim };
    for (const [agent, text] of Object.entries(agentTexts)) {
      row[agent] = scoreAgent(text)[dim];
    }
    return row;
  });

  // Word counts
  const wordCounts = Object.entries(agentTexts).map(([agent, text]) => ({
    agent,
    words: text.trim().split(/\s+/).length,
  }));
  const maxWords = Math.max(...wordCounts.map(w => w.words), 1);

  // Sentiment per agent
  const sentimentData = Object.entries(agentTexts).map(([agent, text]) => ({
    agent,
    ...analyzeSentiment(text),
  }));

  // Readability per agent
  const readabilityData = Object.entries(agentTexts).map(([agent, text]) => ({
    agent,
    score: readabilityScore(text),
    label: readabilityLabel(readabilityScore(text)),
    diversity: lexicalDiversity(text),
  }));

  // Agreement scores (pairwise Jaccard)
  const agents = Object.keys(agentTexts);
  const agreementPairs: { pair: string; score: number }[] = [];
  for (let i = 0; i < agents.length; i++) {
    for (let j = i + 1; j < agents.length; j++) {
      const a = agents[i], b = agents[j];
      agreementPairs.push({
        pair: `${AGENT_DISPLAY[a] || a} ↔ ${AGENT_DISPLAY[b] || b}`,
        score: jaccard(keywordSet(agentTexts[a]), keywordSet(agentTexts[b])),
      });
    }
  }

  // Key themes from synthesis or all text
  const allText = synthesisText || Object.values(agentTexts).join(' ');
  const themes = extractThemes(allText);

  return (
    <div className="analytics-panel">
      {/* Radar Chart */}
      <div className="analytics-card" style={{ gridColumn: '1 / -1' }}>
        <h3><span>📡</span> Agent Perspective Radar</h3>
        <ResponsiveContainer width="100%" height={300}>
          <RadarChart data={radarData}>
            <PolarGrid stroke="rgba(255,255,255,0.08)" />
            <PolarAngleAxis
              dataKey="dim"
              tick={{ fill: '#94a3b8', fontSize: 12, fontFamily: 'Inter, sans-serif' }}
            />
            <Tooltip
              contentStyle={{
                background: '#111827',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px',
                color: '#f1f5f9',
                fontSize: '0.82rem',
              }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(val: any) => [`${val}/100`] as any}
            />
            <Legend
              formatter={(val) => AGENT_DISPLAY[val] || val}
              wrapperStyle={{ fontSize: '0.82rem', paddingTop: '1rem' }}
            />
            {Object.keys(agentTexts).map((agent) => (
              <Radar
                key={agent}
                name={agent}
                dataKey={agent}
                stroke={AGENT_COLORS[agent] || '#6366f1'}
                fill={AGENT_COLORS[agent] || '#6366f1'}
                fillOpacity={0.12}
                strokeWidth={2}
              />
            ))}
          </RadarChart>
        </ResponsiveContainer>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '0.5rem', textAlign: 'center' }}>
          Scores derived from keyword analysis of each agent's responses across all rounds
        </p>
      </div>

      {/* Word Count */}
      <div className="analytics-card">
        <h3><span>📝</span> Response Volume</h3>
        {wordCounts.map(({ agent, words }) => (
          <div key={agent} className="word-bar">
            <div className="word-bar-label">
              <span style={{ color: AGENT_COLORS[agent] || '#6366f1', fontWeight: 600 }}>
                {AGENT_DISPLAY[agent] || agent}
              </span>
              <span style={{ color: 'var(--text-muted)' }}>{words} words</span>
            </div>
            <div className="word-bar-track">
              <div
                className="word-bar-fill"
                style={{
                  width: `${(words / maxWords) * 100}%`,
                  background: AGENT_COLORS[agent] || '#6366f1',
                  opacity: 0.8,
                }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Sentiment Analysis */}
      <div className="analytics-card">
        <h3><span>💬</span> Sentiment Analysis</h3>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
          Positive vs. negative tone based on keyword frequency
        </p>
        {sentimentData.map(({ agent, pos, neg, posRatio }) => (
          <div key={agent} style={{ marginBottom: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
              <span style={{ color: AGENT_COLORS[agent] || '#6366f1', fontWeight: 600, fontSize: '0.85rem' }}>
                {AGENT_DISPLAY[agent] || agent}
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                +{pos} / -{neg}
              </span>
            </div>
            <div className="sentiment-bar-track">
              <div className="sentiment-bar-pos" style={{ width: `${posRatio}%` }} />
              <div className="sentiment-bar-neg" style={{ width: `${100 - posRatio}%` }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', marginTop: '0.2rem' }}>
              <span style={{ color: '#34d399' }}>Positive {posRatio}%</span>
              <span style={{ color: '#f87171' }}>Negative {100 - posRatio}%</span>
            </div>
          </div>
        ))}
      </div>

      {/* Agent Agreement Score */}
      <div className="analytics-card">
        <h3><span>🤝</span> Agent Agreement</h3>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
          Jaccard similarity — shared vocabulary between agents
        </p>
        {agreementPairs.map(({ pair, score }) => (
          <div key={pair} style={{ marginBottom: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{pair}</span>
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: score >= 30 ? '#34d399' : '#f87171' }}>
                {score}%
              </span>
            </div>
            <div className="word-bar-track">
              <div
                className="word-bar-fill"
                style={{
                  width: `${score * 2}%`,
                  background: score >= 30 ? '#34d399' : '#f87171',
                  opacity: 0.75,
                }}
              />
            </div>
          </div>
        ))}
        {agreementPairs.length === 0 && (
          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Not enough agents</span>
        )}
      </div>

      {/* Readability + Vocabulary */}
      <div className="analytics-card">
        <h3><span>📖</span> Readability & Vocabulary</h3>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
          Flesch-Kincaid readability score · Lexical diversity (unique/total words)
        </p>
        <div className="readability-grid">
          {readabilityData.map(({ agent, score, label, diversity }) => (
            <div key={agent} className="readability-card-inner">
              <div style={{ color: AGENT_COLORS[agent] || '#6366f1', fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.4rem' }}>
                {AGENT_DISPLAY[agent] || agent}
              </div>
              <div className="readability-row">
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Readability</span>
                <span style={{ fontWeight: 700, color: score >= 50 ? '#34d399' : '#f59e0b', fontSize: '0.9rem' }}>
                  {score} <span style={{ fontWeight: 400, fontSize: '0.72rem', color: 'var(--text-muted)' }}>({label})</span>
                </span>
              </div>
              <div className="readability-row">
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Vocabulary</span>
                <span style={{ fontWeight: 700, color: '#a855f7', fontSize: '0.9rem' }}>
                  {diversity}% <span style={{ fontWeight: 400, fontSize: '0.72rem', color: 'var(--text-muted)' }}>unique</span>
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Key Themes */}
      <div className="analytics-card">
        <h3><span>🏷️</span> Key Themes</h3>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
          Most-discussed topics extracted from the debate
        </p>
        <div className="theme-tags">
          {themes.map((t) => (
            <span key={t} className="theme-tag">{t}</span>
          ))}
          {themes.length === 0 && (
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Not enough data</span>
          )}
        </div>
      </div>
    </div>
  );
}


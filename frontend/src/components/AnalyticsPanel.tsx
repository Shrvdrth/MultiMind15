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

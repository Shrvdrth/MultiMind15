import SpeechControls from './SpeechControls';
import { buildBusinessOutlook, classifyTopic, outlookToSpeech } from '../utils/topicInsights';

interface FutureBusinessOutlookProps {
  prompt: string;
  synthesisText?: string;
}

export default function FutureBusinessOutlook({ prompt, synthesisText }: FutureBusinessOutlookProps) {
  const profile = classifyTopic(`${prompt}\n${synthesisText ?? ''}`);
  const sections = buildBusinessOutlook(prompt, synthesisText);
  const speechText = outlookToSpeech(profile, sections);

  return (
    <section className="future-outlook" aria-labelledby="future-outlook-title">
      <div className="future-outlook__header">
        <div>
          <span className="future-outlook__eyebrow" style={{ color: profile.accent }}>
            {profile.label}
          </span>
          <h2 id="future-outlook-title">{profile.outlookTitle}</h2>
          <p>{profile.outlookDescription}</p>
        </div>
        <SpeechControls text={speechText} label={profile.outlookTitle} />
      </div>

      <div className="future-outlook__grid">
        {sections.map(section => (
          <article key={section.title} className="future-outlook-card">
            <h3>{section.title}</h3>
            <ul>
              {section.items.map(item => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}

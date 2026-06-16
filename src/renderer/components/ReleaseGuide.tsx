import { LATEST_RELEASE_GUIDE } from '../../shared/changelog';

export default function ReleaseGuide({ mode = 'modal' }: { mode?: 'modal' | 'onboarding' }) {
  return (
    <div className={`release-guide ${mode}`}>
      {LATEST_RELEASE_GUIDE.map((section) => (
        <section className="release-guide-card" key={section.title}>
          <div className="release-guide-media">
            <img src={section.image} alt={section.title} />
          </div>
          <div className="release-guide-copy">
            <strong>{section.title}</strong>
            <p>{section.body}</p>
            <ol className="release-guide-steps">
              {section.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
        </section>
      ))}
    </div>
  );
}

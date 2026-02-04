import type { Flow } from "../../studio/types";

type ChoiceSectionProps = {
  onChoose: (nextFlow: Flow) => void;
};

export default function ChoiceSection({ onChoose }: ChoiceSectionProps) {
  return (
    <section className="choice">
      <h1>What do you want to create?</h1>
      <div className="choice-buttons">
        <button className="primary" onClick={() => onChoose("site")}>
          A site
        </button>
        <button className="ghost" onClick={() => onChoose("index")}>
          An index
        </button>
      </div>
    </section>
  );
}

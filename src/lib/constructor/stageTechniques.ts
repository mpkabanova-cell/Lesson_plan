import techniquesData from "./data/stageTechniques.json";

export type StageTechnique = {
  id: string;
  name: string;
  description: string;
  allowedStages?: string[];
  subjects?: string[];
  example?: string;
};

type PhaseConfig = {
  label: string;
  techniques: StageTechnique[];
};

const data = techniquesData as {
  phases: Record<string, PhaseConfig>;
  stagePhaseMap: Record<string, string>;
};

function topicHash(topic: string): number {
  let h = 0;
  for (const ch of topic.toLowerCase()) {
    h = (h + ch.charCodeAt(0)) % 10007;
  }
  return h;
}

export function getTechniquesForStage(stageId: string): StageTechnique[] {
  const phaseId = data.stagePhaseMap[stageId] ?? "general";
  const phase = data.phases[phaseId];
  if (!phase) return data.phases.general?.techniques ?? [];
  return phase.techniques;
}

export function getAllTechniques(): StageTechnique[] {
  const seen = new Set<string>();
  const out: StageTechnique[] = [];
  for (const phase of Object.values(data.phases)) {
    for (const technique of phase.techniques) {
      if (seen.has(technique.id)) continue;
      seen.add(technique.id);
      out.push(technique);
    }
  }
  return out;
}

export function getTechniqueById(id: string): StageTechnique | undefined {
  return getAllTechniques().find((technique) => technique.id === id);
}

export function getTechniqueByName(name: string): StageTechnique | undefined {
  const normalized = normalizeTechniqueName(name);
  return getAllTechniques().find((technique) => normalizeTechniqueName(technique.name) === normalized);
}

export function getTechniquePickerOptions(stageId: string): {
  suitable: StageTechnique[];
  other: StageTechnique[];
} {
  const suitable = getTechniquesForStage(stageId);
  const suitableIds = new Set(suitable.map((technique) => technique.id));
  return {
    suitable,
    other: getAllTechniques().filter((technique) => !suitableIds.has(technique.id)),
  };
}

export function isTechniqueSuitableForStage(stageId: string, techniqueId: string): boolean {
  return getTechniquesForStage(stageId).some((technique) => technique.id === techniqueId);
}

export function getPhaseLabelForStage(stageId: string): string {
  const phaseId = data.stagePhaseMap[stageId] ?? "general";
  return data.phases[phaseId]?.label ?? "Общие приёмы";
}

export function pickTechniqueForStage(
  stageId: string,
  stageIndex: number,
  topic: string,
  usedTechniqueNames: string[],
): StageTechnique {
  const pool = getTechniquesForStage(stageId);
  if (pool.length === 0) {
    return { id: "general", name: "Методический приём", description: "Подходящий приём для этапа." };
  }

  const available = pool.filter((t) => !usedTechniqueNames.some((u) => normalizeTechniqueName(u) === normalizeTechniqueName(t.name)));
  const candidates = available.length > 0 ? available : pool;
  const idx = (stageIndex + topicHash(topic)) % candidates.length;
  return candidates[idx];
}

export function normalizeTechniqueName(name: string): string {
  return name.replace(/\s+/g, " ").trim().toLowerCase();
}

export function extractTechniqueFromMarkdown(markdown: string): string | null {
  const m = markdown.match(/^\s*(?:\*\*)?методический\s+при[её]м(?:\*\*)?\s*:\s*(.+)$/im);
  return m ? m[1].trim() : null;
}

export function collectUsedTechniques(stageMarkdowns: string[]): string[] {
  const names: string[] = [];
  for (const md of stageMarkdowns) {
    const name = extractTechniqueFromMarkdown(md);
    if (name) names.push(name);
  }
  return names;
}

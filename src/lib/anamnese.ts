/** Campos da anamnese (ficha clínica). */
export const ANAMNESE_FLAGS = [
  ['hipertensao', 'Hipertensão'],
  ['diabetes', 'Diabetes'],
  ['cardiopatia', 'Problema cardíaco'],
  ['coagulacao', 'Problema de coagulação'],
  ['anticoagulante', 'Usa anticoagulante'],
  ['marcapasso', 'Marca-passo'],
  ['gestante', 'Gestante ou amamentando'],
  ['fumante', 'Fumante'],
  ['isotretinoina', 'Usa ou usou isotretinoína (6 meses)'],
  ['queloide', 'Tendência a queloide'],
] as const;
export const ANAMNESE_TEXTS = [
  ['queixa', 'Queixa principal / objetivo'],
  ['alergias', 'Alergias (medicamentos, anestésicos, látex, cosméticos)'],
  ['medicamentos', 'Medicamentos em uso'],
  ['doencas', 'Doenças e condições de saúde'],
  ['cirurgias', 'Cirurgias e tratamentos anteriores'],
  ['observacoes', 'Observações'],
] as const;
export type Anamnese = Partial<Record<(typeof ANAMNESE_TEXTS)[number][0], string> & Record<(typeof ANAMNESE_FLAGS)[number][0], boolean>>;

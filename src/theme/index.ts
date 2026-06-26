export const colors = {
  background: '#0A0A0F',
  surface: '#13131A',
  surfaceAlt: '#1C1C26',
  surfaceHover: '#232330',
  primary: '#00E676',
  primaryDim: '#00E67620',
  primaryDark: '#00B85C',
  danger: '#FF4D4D',
  dangerDim: '#FF4D4D20',
  warning: '#FF9100',
  warningDim: '#FF910020',
  info: '#4D9FFF',
  infoDim: '#4D9FFF20',
  textPrimary: '#FFFFFF',
  textSecondary: '#8A8AA0',
  textMuted: '#55556A',
  border: '#1E1E2E',
  borderLight: '#2A2A3C',
  // Categorias
  alimentacao: '#FF7043',
  transporte: '#42A5F5',
  fornecedores: '#AB47BC',
  moradia: '#26A69A',
  saude: '#EF5350',
  lazer: '#FFA726',
  outros: '#78909C',
  pessoal: '#4D9FFF',
  negocio: '#AB47BC',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const borderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};

export const fontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const fontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  extrabold: '800' as const,
};

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  glow: (color: string) => ({
    shadowColor: color,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  }),
};

export const categoryColors: Record<string, string> = {
  Alimentação: colors.alimentacao,
  Transporte: colors.transporte,
  Fornecedores: colors.fornecedores,
  Moradia: colors.moradia,
  Saúde: colors.saude,
  Lazer: colors.lazer,
  Outros: colors.outros,
};

export const categoryIcons: Record<string, string> = {
  Alimentação: 'fast-food',
  Transporte: 'car',
  Fornecedores: 'cube',
  Moradia: 'home',
  Saúde: 'medkit',
  Lazer: 'game-controller',
  Outros: 'ellipsis-horizontal',
};

export const CATEGORIES = [
  'Alimentação',
  'Transporte',
  'Fornecedores',
  'Moradia',
  'Saúde',
  'Lazer',
  'Outros',
];

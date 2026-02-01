
export interface Point {
  x: number;
  y: number;
}

export interface Bubble {
  id: string;
  text: string;
  x: number;
  y: number;
  driftX: number; // Random horizontal drift amount
  rotation: number; // Random rotation for floating feel
}

export interface HandData {
  palmBase: Point;
  isRaised: boolean;
  landmarks: Point[]; // Full set of hand landmarks
}

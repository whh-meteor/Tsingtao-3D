/** CharacterController.integrate resolves contacts; the game applies free-fall acceleration explicitly. */
export function nextVerticalVelocity(current: number, supported: boolean, jump: boolean, dt: number): number {
  if (jump && supported) return 5;
  if (supported && current <= 0) return -.3;
  return current - 9.81 * dt;
}

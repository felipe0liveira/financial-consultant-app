import { claimOpenSwipe, releaseOpenSwipe } from "../openSwipe";

test("opening a row closes the previously open one", () => {
  const a = { close: jest.fn() };
  const b = { close: jest.fn() };
  claimOpenSwipe(a);
  claimOpenSwipe(a);
  expect(a.close).not.toHaveBeenCalled();
  claimOpenSwipe(b);
  expect(a.close).toHaveBeenCalledTimes(1);
  releaseOpenSwipe(b);
  claimOpenSwipe(a);
  expect(b.close).not.toHaveBeenCalled();
  releaseOpenSwipe(a);
});

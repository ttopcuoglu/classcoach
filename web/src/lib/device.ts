/// Whether a "Take a photo" button will actually take a photo here.
///
/// `capture` on a file input is honoured on phones and tablets and
/// silently ignored everywhere else — so on a laptop the button opens a
/// file browser, which is exactly what the button beside it does, and
/// reads as broken. There is no feature test for it: the attribute is
/// accepted and dropped without complaint.
///
/// A coarse pointer is the closest honest proxy for "this device has a
/// camera you'd hold up to a worksheet". A touchscreen laptop reports a
/// fine pointer as its primary one, which is the right answer for it too:
/// nobody photographs a handout with a laptop lid.
export function canTakePhoto(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true
}

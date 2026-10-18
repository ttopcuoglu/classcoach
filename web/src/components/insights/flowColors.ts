import type { FlowKind } from '../../lib/talkFlow'

/// The Talk & Pace palette, validated (dataviz validate_palette.js, light,
/// on the cream surface): lightness band, chroma floor, colour-blind and
/// normal-vision separation all pass. Amber and blue sit under 3:1 against the
/// surface, so every slot is shown with a visible label and percentage.
/// Terracotta stays reserved for fast stretches; "unknown" is the report's
/// hatch, the mark for "the recording cannot say".
export const FLOW_COLOR: Record<Exclude<FlowKind, 'unknown'>, string> = {
  you: '#2F855A',
  other: '#8B7BC2',
  sound: '#D08A2A',
  quiet: '#3F8FD8',
}

export const FLOW_LABEL: Record<FlowKind, string> = {
  you: 'You',
  other: 'Other voices',
  sound: 'Sound, no words',
  quiet: 'Quiet',
  unknown: 'No reading',
}

export const FAST_COLOR = '#C96A45'

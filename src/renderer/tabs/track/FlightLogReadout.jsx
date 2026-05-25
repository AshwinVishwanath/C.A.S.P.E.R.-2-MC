/**
 * FlightLogReadout — wraps the existing FlightLogPanel component.
 *
 * FlightLogPanel manages its own state via the useFlightLog hook and expects:
 *   conn:  boolean — whether the FC serial link is up
 *   theme: T       — theme object
 */
import React from 'react';
import { useTheme } from '../../design/ThemeContext';
import FlightLogPanel from '../../components/FlightLogPanel.jsx';

export default function FlightLogReadout({ serial }) {
  const T = useTheme();
  const conn = serial && serial.fc_connected;

  return (
    <FlightLogPanel conn={conn} theme={T} />
  );
}

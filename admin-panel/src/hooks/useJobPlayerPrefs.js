import { useCallback, useEffect, useState } from 'react';
import {
  ensureJobPlayerPrefsLoaded,
  getJobPlayerPref,
  readJobPlayerPrefs,
  setJobFavorite,
  setJobRemark,
  subscribeJobPlayerPrefs,
} from '../data/jobPlayerPrefs';

export function useJobPlayerPrefsMap() {
  const [map, setMap] = useState(readJobPlayerPrefs);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    ensureJobPlayerPrefsLoaded()
      .then((prefs) => {
        if (!cancelled) {
          setMap({ ...prefs });
          setReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMap(readJobPlayerPrefs());
          setReady(true);
        }
      });
    return subscribeJobPlayerPrefs(() => setMap(readJobPlayerPrefs()));
  }, []);

  return { map, ready };
}

export function useJobPlayerPref(row) {
  const [pref, setPref] = useState(() => getJobPlayerPref(row));
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    ensureJobPlayerPrefsLoaded().then(() => {
      if (!cancelled) {
        setPref(getJobPlayerPref(row));
        setReady(true);
      }
    });
    return subscribeJobPlayerPrefs(() => setPref(getJobPlayerPref(row)));
  }, [row]);

  const toggleFavorite = useCallback(async () => {
    await ensureJobPlayerPrefsLoaded();
    const next = !getJobPlayerPref(row).favorite;
    await setJobFavorite(row, next);
    setPref(getJobPlayerPref(row));
  }, [row]);

  const updateRemark = useCallback(
    async (remark) => {
      await ensureJobPlayerPrefsLoaded();
      await setJobRemark(row, remark);
      setPref(getJobPlayerPref(row));
    },
    [row],
  );

  return { ...pref, ready, toggleFavorite, updateRemark };
}

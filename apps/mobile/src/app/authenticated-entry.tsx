import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { useSession } from '../components/providers';
import { Loading } from '../components/frame';
import { entryFor, readMode, forgetAdminMode, type AppMode } from '../lib/owner-mode';

export default function AuthenticatedEntry() {
  const profile = useSession().profile;
  const userId = profile?.user.id;
  const [mode, setMode] = useState<{ userId: string; value: AppMode | undefined }>();
  useEffect(() => {
    if (!userId) return;
    let live = true;
    void readMode(userId).then((value) => {
      if (live) {
        if (value === 'admin' && !profile?.capabilities.admin) void forgetAdminMode(userId);
        setMode({ userId, value });
      }
    });
    return () => {
      live = false;
    };
  }, [userId]);

  if (!profile) return <Redirect href="/" />;
  if (mode?.userId !== profile.user.id) return <Loading />;
  return <Redirect href={entryFor(profile, mode.value)} />;
}

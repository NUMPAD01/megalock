"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useAccount } from "wagmi";

interface UserProfile {
  username: string;
  xHandle: string;
}

interface ProfileContextType {
  username: string;
  xHandle: string;
  setUsername: (name: string) => void;
  setXHandle: (handle: string) => void;
  isConnected: boolean;
  address: string | undefined;
}

const ProfileContext = createContext<ProfileContextType>({
  username: "",
  xHandle: "",
  setUsername: () => {},
  setXHandle: () => {},
  isConnected: false,
  address: undefined,
});

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const { address, isConnected } = useAccount();
  const [username, setUsernameState] = useState("");
  const [xHandle, setXHandleState] = useState("");

  // Load profile from localStorage when wallet connects
  useEffect(() => {
    if (!address) {
      setUsernameState("");
      setXHandleState("");
      return;
    }
    try {
      const stored = localStorage.getItem(`megascan_profile_${address.toLowerCase()}`);
      if (stored) {
        const profile: UserProfile = JSON.parse(stored);
        setUsernameState(profile.username || "");
        setXHandleState(profile.xHandle || "");
      } else {
        setUsernameState("");
        setXHandleState("");
      }
    } catch {
      setUsernameState("");
      setXHandleState("");
    }
  }, [address]);

  const save = useCallback(
    (u: string, x: string) => {
      if (!address) return;
      localStorage.setItem(
        `megascan_profile_${address.toLowerCase()}`,
        JSON.stringify({ username: u, xHandle: x })
      );
    },
    [address]
  );

  const setUsername = useCallback(
    (name: string) => {
      const trimmed = name.slice(0, 20);
      setUsernameState(trimmed);
      save(trimmed, xHandle);
    },
    [save, xHandle]
  );

  const setXHandle = useCallback(
    (handle: string) => {
      const cleaned = handle.replace(/^@/, "").slice(0, 30);
      setXHandleState(cleaned);
      save(username, cleaned);
    },
    [save, username]
  );

  return (
    <ProfileContext.Provider value={{ username, xHandle, setUsername, setXHandle, isConnected, address }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  return useContext(ProfileContext);
}

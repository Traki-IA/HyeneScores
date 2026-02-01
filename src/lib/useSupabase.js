import { useState, useEffect, useCallback } from 'react';
import { fetchAppData } from './supabase';

/**
 * Hook pour charger les donnees depuis Supabase
 * Remplace le systeme d'import JSON manuel
 */
export function useSupabaseData() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const appData = await fetchAppData();
      setData(appData);
    } catch (err) {
      console.error('Erreur chargement Supabase:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return {
    data,
    loading,
    error,
    reload: loadData
  };
}

/**
 * Hook pour verifier la connexion Supabase
 */
export function useSupabaseStatus() {
  const [isConnected, setIsConnected] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    async function checkConnection() {
      try {
        // Tente de faire une requete simple pour verifier la connexion
        const response = await fetchAppData();
        setIsConnected(true);
      } catch (err) {
        setIsConnected(false);
      } finally {
        setChecking(false);
      }
    }
    checkConnection();
  }, []);

  return { isConnected, checking };
}

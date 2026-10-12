import React, { useState, useEffect } from 'react';
import { 
  NavigationTab, 
  BucketCategory, 
  MediaAsset, 
  Project, 
  LiveIngestionEvent, 
  PipelineSettingsState 
} from './types';
import { 
  INITIAL_PROJECTS, 
  INITIAL_ASSETS, 
  INITIAL_LIVE_EVENTS 
} from './data/seedData';
import { Navigation } from './components/Navigation';
import { WorkspaceView } from './components/WorkspaceView';
import { BucketsView } from './components/BucketsView';
import { IngestionView } from './components/IngestionView';
import { LibraryView } from './components/LibraryView';
import { SettingsView } from './components/SettingsView';
import { UploadModal } from './components/UploadModal';
import { NewProjectModal } from './components/NewProjectModal';
import { EditTagsModal } from './components/EditTagsModal';
import { ExportModal } from './components/ExportModal';
import { AuthView } from './components/AuthView';
import { supabase, isSupabaseConfigured } from './lib/supabaseClient';
import { useAuth } from './lib/AuthContext';
import { useNotifications } from './lib/NotificationsContext';
import { removeAssetsFromStorage } from './lib/ingestionService';
import { projectRowToProject, assetRowToAsset, assetToRow } from './lib/mappers';

export function App() {
  const { user, isLoading: authLoading } = useAuth();
  const { notify } = useNotifications();
  const [currentTab, setCurrentTab] = useState<NavigationTab>('workspace');
  const [currentBucketCategory, setCurrentBucketCategory] = useState<BucketCategory>('humans');
  const [searchQuery, setSearchQuery] = useState('');

  // State Stores — everything starts empty; counts only ever reflect real, added media.
  const [projects, setProjects] = useState<Project[]>(INITIAL_PROJECTS);
  const [assets, setAssets] = useState<MediaAsset[]>(INITIAL_ASSETS);
  const [liveEvents, setLiveEvents] = useState<LiveIngestionEvent[]>(INITIAL_LIVE_EVENTS);
  const [selectedAssetForInspector, setSelectedAssetForInspector] = useState<MediaAsset | null>(null);
  const [isLoadingRemote, setIsLoadingRemote] = useState(isSupabaseConfigured);
  const [activeProjectId, setActiveProjectId] = useState<string>(INITIAL_PROJECTS[0]?.id ?? '');

  // Load real data from Supabase once a user is signed in (falls back to seed/demo data otherwise).
  useEffect(() => {
    if (!isSupabaseConfigured || !user) return;

    setProjects([]);
    setAssets([]);
    setSelectedAssetForInspector(null);
    setIsLoadingRemote(true);

    (async () => {
      const [{ data: projectRows, error: projErr }, { data: assetRows, error: assetErr }] = await Promise.all([
        supabase.from('projects').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('media_assets').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
      ]);

      if (!projErr && projectRows && projectRows.length > 0) {
        const loadedProjects = projectRows.map(projectRowToProject);
        setProjects(loadedProjects);
        setActiveProjectId(loadedProjects[0].id);
      } else {
        // Fresh account, no projects yet — start from an empty catalog rather than demo data.
        setProjects([]);
      }

      if (!assetErr && assetRows && assetRows.length > 0) {
        const loadedAssets = assetRows.map(assetRowToAsset);
        setAssets(loadedAssets);
        setSelectedAssetForInspector(loadedAssets[0]);
      }

      setIsLoadingRemote(false);
    })();
  }, [user?.id]);
  
  const [pipelineSettings, setPipelineSettings] = useState<PipelineSettingsState>({
    tier1Threshold: 0.90,
    tier2Threshold: 0.75,
    requireHumanReviewForPeople: true,
    strictMoodMatching: false,
    activeVisionCore: true,
    activeSemanticTagging: true,
    facialRecognitionEnabled: true
  });

  // Modals state
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isNewProjectOpen, setIsNewProjectOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<MediaAsset | null>(null);
  const [exportState, setExportState] = useState<{ open: boolean; assets: MediaAsset[]; label?: string }>({
    open: false,
    assets: []
  });

  /**
   * Opens the export dialog. With no argument it exports the whole catalog;
   * callers can pass a narrower selection (e.g. the Library's checked assets).
   */
  const openExport = (scopeAssets?: MediaAsset[], label?: string) => {
    const scope = scopeAssets && scopeAssets.length > 0 ? scopeAssets : assets;
    setExportState({
      open: true,
      assets: scope,
      label: label ?? (scope === assets ? 'whole catalog' : undefined)
    });
  };

  // Asset Actions
  const handleUploadSuccess = (newAssets: MediaAsset[]) => {
    if (newAssets.length === 0) return;
    setAssets((prev) => [...newAssets, ...prev]);

    // Add live ingestion events
    const newEvents: LiveIngestionEvent[] = newAssets.map((asset) => ({
      id: `ev-${Date.now()}-${Math.random()}`,
      timestamp: new Date().toLocaleTimeString(),
      type: asset.primaryCategory === 'human' ? 'subject' : 'object',
      message: `${asset.primaryCategory === 'human' ? 'Subject' : 'Object'} auto-classified: ${asset.tier1Tags[0]?.label || 'Media'}`,
      target: asset.fileName,
      subtext: `Routed to ${asset.autoOrganizedBucket}`,
      confidence: asset.aiConfidenceScore
    }));

    setLiveEvents((prev) => [...newEvents, ...prev]);

    // Notify — real counts from what was actually ingested.
    const imageCount = newAssets.filter((a) => a.mediaKind === 'image').length;
    const videoCount = newAssets.length - imageCount;
    const reviewCount = newAssets.filter((a) => a.routeStatus === 'review_needed').length;
    const parts: string[] = [];
    if (imageCount) parts.push(`${imageCount} photo${imageCount === 1 ? '' : 's'}`);
    if (videoCount) parts.push(`${videoCount} video${videoCount === 1 ? '' : 's'}`);
    if (reviewCount) parts.push(`${reviewCount} to review`);
    notify({
      kind: reviewCount > 0 ? 'warning' : 'success',
      title: `${newAssets.length} item${newAssets.length === 1 ? '' : 's'} added`,
      detail: parts.join(' · ') || undefined
    });
  };

  const handleCreateProject = (newProject: Project) => {
    setProjects((prev) => [newProject, ...prev]);
    setActiveProjectId(newProject.id);
    notify({ kind: 'info', title: 'Project created', detail: newProject.title });
  };

  const handleApproveRoute = (assetId: string) => {
    setAssets((prev) =>
      prev.map((a) => (a.id === assetId ? { ...a, routeStatus: 'auto_routed' } : a))
    );
    if (isSupabaseConfigured) {
      supabase.from('media_assets').update({ route_status: 'auto_routed' }).eq('id', assetId);
    }
  };

  const handleSaveTags = (updatedAsset: MediaAsset) => {
    setAssets((prev) =>
      prev.map((a) => (a.id === updatedAsset.id ? updatedAsset : a))
    );
    if (selectedAssetForInspector?.id === updatedAsset.id) {
      setSelectedAssetForInspector(updatedAsset);
    }
    if (isSupabaseConfigured) {
      supabase.from('media_assets').update(assetToRow(updatedAsset)).eq('id', updatedAsset.id);
    }
  };

  const handleToggleAssetSelection = (assetId: string) => {
    setAssets((prev) =>
      prev.map((a) => (a.id === assetId ? { ...a, isSelected: !a.isSelected } : a))
    );
  };

  const handleSelectAllAssets = () => {
    setAssets((prev) => prev.map((a) => ({ ...a, isSelected: true })));
  };

  const handleDeselectAllAssets = () => {
    setAssets((prev) => prev.map((a) => ({ ...a, isSelected: false })));
  };

  const handleDeleteSelected = async () => {
    const toDelete = assets.filter((a) => a.isSelected);
    if (toDelete.length === 0) return;
    const idsToDelete = toDelete.map((a) => a.id);

    if (isSupabaseConfigured && idsToDelete.length > 0) {
      if (!user) return;
      await removeAssetsFromStorage(toDelete, user.id);
      const { error } = await supabase
        .from('media_assets')
        .delete()
        .eq('user_id', user.id)
        .in('id', idsToDelete);
      if (error) {
        notify({ kind: 'warning', title: 'Delete failed', detail: error.message });
        return;
      }
    }

    setAssets((prev) => prev.filter((a) => !a.isSelected));
    setSelectedAssetForInspector((cur) => (cur && idsToDelete.includes(cur.id) ? null : cur));

    notify({
      kind: 'info',
      title: `${idsToDelete.length} item${idsToDelete.length === 1 ? '' : 's'} deleted`
    });
  };

  /**
   * Deletes a whole project: its row, all of its assets (DB rows + stored
   * files), and any UI state that pointed at it. Once gone it won't reappear
   * unless the user adds it again.
   */
  const handleDeleteProject = async (projectId: string) => {
    const project = projects.find((p) => p.id === projectId);
    const projectAssets = assets.filter((a) => a.projectId === projectId);

    if (isSupabaseConfigured) {
      if (!user) return;
      await removeAssetsFromStorage(projectAssets, user.id);
      // Assets first, then the project row they belong to.
      const { error: assetDeleteError } = await supabase
        .from('media_assets')
        .delete()
        .eq('user_id', user.id)
        .eq('project_id', projectId);
      if (assetDeleteError) {
        notify({ kind: 'warning', title: 'Project deletion failed', detail: assetDeleteError.message });
        return;
      }
      const { error: projectDeleteError } = await supabase
        .from('projects')
        .delete()
        .eq('user_id', user.id)
        .eq('id', projectId);
      if (projectDeleteError) {
        notify({ kind: 'warning', title: 'Project deletion failed', detail: projectDeleteError.message });
        return;
      }
    }

    setProjects((prev) => prev.filter((p) => p.id !== projectId));
    setAssets((prev) => prev.filter((a) => a.projectId !== projectId));
    setSelectedAssetForInspector((cur) => (cur && cur.projectId === projectId ? null : cur));
    setActiveProjectId((cur) => (cur === projectId ? '' : cur));

    notify({ kind: 'info', title: 'Project deleted', detail: project?.title });
  };

  const handleSelectProject = (projectId: string) => {
    const proj = projects.find((p) => p.id === projectId);
    if (proj) {
      setActiveProjectId(proj.id);
      setSearchQuery(proj.title);
      setCurrentTab('library');
    }
  };

  if (isSupabaseConfigured && authLoading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-accent border-t-transparent animate-spin" />
      </div>
    );
  }

  if (isSupabaseConfigured && !user) {
    return <AuthView />;
  }

  return (
    <div className="min-h-screen bg-surface text-ink flex flex-col antialiased selection:bg-accent selection:text-white">
      {/* Navigation Layer */}
      <Navigation
        currentTab={currentTab}
        onTabChange={(tab) => {
          setCurrentTab(tab);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        currentBucketCategory={currentBucketCategory}
        onBucketCategoryChange={setCurrentBucketCategory}
        searchQuery={searchQuery}
        onSearchChange={(q) => {
          setSearchQuery(q);
          if (q && currentTab !== 'library') {
            setCurrentTab('library');
          }
        }}
        onOpenUpload={() => setIsUploadOpen(true)}
        onOpenNewProject={() => setIsNewProjectOpen(true)}
      />

      {/* Main Content Viewport */}
      <main className="flex-1 md:pl-[240px] lg:pl-[260px] md:pt-24 pt-16 px-3 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full transition-all pb-24 md:pb-12 min-h-screen">
        {currentTab === 'workspace' && (
          <WorkspaceView
            projects={projects}
            assets={assets}
            liveEvents={liveEvents}
            onSelectProject={handleSelectProject}
            onDeleteProject={handleDeleteProject}
            onNavigateTab={setCurrentTab}
            onSelectBucket={(cat) => {
              setCurrentBucketCategory(cat);
              setCurrentTab('buckets');
            }}
            onOpenUpload={() => setIsUploadOpen(true)}
            onOpenNewProject={() => setIsNewProjectOpen(true)}
            onOpenExport={() => openExport()}
          />
        )}

        {currentTab === 'library' && (
          <LibraryView
            assets={assets}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onSelectAssetForInspector={(asset) => {
              setSelectedAssetForInspector(asset);
              // Videos live in their own bucket regardless of subject.
              if (asset.mediaKind === 'video') setCurrentBucketCategory('videos');
              else if (asset.primaryCategory === 'human') setCurrentBucketCategory('humans');
              else setCurrentBucketCategory('nonhuman');
              setCurrentTab('buckets');
            }}
            onToggleAssetSelection={handleToggleAssetSelection}
            onSelectAllAssets={handleSelectAllAssets}
            onDeselectAllAssets={handleDeselectAllAssets}
            onEditTags={(asset) => setEditingAsset(asset)}
            onDeleteSelected={handleDeleteSelected}
            onOpenExport={openExport}
          />
        )}

        {currentTab === 'ingestion' && (
          <IngestionView
            assets={assets}
            pipelineSettings={pipelineSettings}
            onUpdateSettings={setPipelineSettings}
            onApproveAsset={handleApproveRoute}
            onEditTags={(asset) => setEditingAsset(asset)}
            onOpenUpload={() => setIsUploadOpen(true)}
          />
        )}

        {currentTab === 'buckets' && (
          <BucketsView
            category={currentBucketCategory}
            onCategoryChange={setCurrentBucketCategory}
            assets={assets}
            selectedAsset={selectedAssetForInspector}
            onSelectAsset={setSelectedAssetForInspector}
            onEditTags={(asset) => setEditingAsset(asset)}
          />
        )}

        {currentTab === 'settings' && (
          <SettingsView
            projects={projects}
            assets={assets}
            onDeleteProject={handleDeleteProject}
            onOpenExport={() => openExport()}
          />
        )}
      </main>

      {/* Upload / Ingestion Modal */}
      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onUploadSuccess={handleUploadSuccess}
        targetProjectId={activeProjectId}
        targetProjectName={projects.find((p) => p.id === activeProjectId)?.title ?? 'General'}
      />

      {/* New Project Modal — also handles folder drag-and-drop ingestion */}
      <NewProjectModal
        isOpen={isNewProjectOpen}
        onClose={() => setIsNewProjectOpen(false)}
        onCreateProject={handleCreateProject}
        onIngestComplete={handleUploadSuccess}
      />

      {/* Edit Tags / AI Taxonomy Modal */}
      <EditTagsModal
        asset={editingAsset}
        isOpen={!!editingAsset}
        onClose={() => setEditingAsset(null)}
        onSave={handleSaveTags}
      />

      {/* Export — ZIP mirroring the Smart Buckets, or a CSV catalog */}
      <ExportModal
        isOpen={exportState.open}
        onClose={() => setExportState((s) => ({ ...s, open: false }))}
        assets={exportState.assets}
        scopeLabel={exportState.label}
      />
    </div>
  );
}

export default App;

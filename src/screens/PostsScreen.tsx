/**
 * src/screens/PostsScreen.tsx
 *
 * Posts Tab entry point — connects directly to PostsListScreen.
 */

import React from 'react';
import PostsListScreen from './Posts/PostsListScreen';

const PostsScreen: React.FC = () => {
  return <PostsListScreen />;
};

export default PostsScreen;

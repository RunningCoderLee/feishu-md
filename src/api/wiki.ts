import type * as lark from '@larksuiteoapi/node-sdk';

export interface WikiNode {
  spaceId: string;
  nodeToken: string;
  objToken: string;
  objType: string;
  title: string;
  hasChild: boolean;
}

/**
 * 获取知识库节点信息
 *
 * 文档: https://open.feishu.cn/document/ukTMukTMukTM/uUDN04SN0QjL1QDN/wiki-v2/space/get_node
 */
export async function getWikiNodeInfo(client: lark.Client, token: string): Promise<WikiNode> {
  const response = await client.wiki.space.getNode({
    params: {
      token,
    },
  });

  if (response.code !== 0) {
    throw new Error(`获取节点信息失败: ${response.msg} (code: ${response.code})`);
  }

  const node = response.data?.node;
  if (!node) {
    throw new Error('获取节点信息失败: 返回数据为空');
  }

  return {
    spaceId: node.space_id || '',
    nodeToken: node.node_token || '',
    objToken: node.obj_token || '',
    objType: node.obj_type,
    title: node.title || '',
    hasChild: node.has_child || false,
  };
}

/**
 * 获取知识库子节点列表（递归获取全部子节点）
 *
 * 文档: https://open.feishu.cn/document/ukTMukTMukTM/uUDN04SN0QjL1QDN/wiki-v2/space-node/list
 */
export async function getWikiChildNodes(
  client: lark.Client,
  spaceId: string,
  parentNodeToken: string,
): Promise<WikiNode[]> {
  const allNodes: WikiNode[] = [];
  let pageToken: string | undefined;

  do {
    const response = await client.wiki.spaceNode.list({
      path: {
        space_id: spaceId,
      },
      params: {
        page_size: 50,
        page_token: pageToken,
        parent_node_token: parentNodeToken,
      },
    });

    if (response.code !== 0) {
      throw new Error(`获取子节点列表失败: ${response.msg} (code: ${response.code})`);
    }

    const items = response.data?.items || [];
    for (const item of items) {
      allNodes.push({
        spaceId: item.space_id || '',
        nodeToken: item.node_token || '',
        objToken: item.obj_token || '',
        objType: item.obj_type,
        title: item.title || '',
        hasChild: item.has_child || false,
      });
    }

    pageToken = response.data?.has_more ? response.data?.page_token : undefined;
  } while (pageToken);

  return allNodes;
}

/**
 * 递归获取节点树（包含自身和所有子孙节点）
 */
export async function getWikiNodeTree(
  client: lark.Client,
  spaceId: string,
  rootNode: WikiNode,
  visited = new Set<string>(),
): Promise<WikiTreeNode> {
  if (visited.has(rootNode.nodeToken)) {
    return { ...rootNode, children: [] };
  }
  visited.add(rootNode.nodeToken);

  const children = rootNode.hasChild
    ? await getWikiChildNodes(client, spaceId, rootNode.nodeToken)
    : [];

  const childTrees = await Promise.all(
    children.map((child) => getWikiNodeTree(client, spaceId, child, visited)),
  );

  return {
    ...rootNode,
    children: childTrees,
  };
}

export interface WikiTreeNode extends WikiNode {
  children: WikiTreeNode[];
}

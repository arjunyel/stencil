import { isDecoratorNamed, isPropertyWithDecorators } from './utils';
import { MembersMeta } from '../../../declarations';
import { MEMBER_TYPE } from '../../../util/constants';
import * as ts from 'typescript';


export function getStateDecoratorMeta(checker: ts.TypeChecker, classNode: ts.ClassDeclaration): MembersMeta {
  checker;
  return classNode.members
    .filter(isPropertyWithDecorators)
    .reduce((membersMeta, member) => {
      const elementDecorator = member.decorators.find(isDecoratorNamed('State'));

      if (elementDecorator) {
        membersMeta[member.name.getText()] = {
          memberType: MEMBER_TYPE.State
        };
      }

      return membersMeta;
    }, {} as MembersMeta);
}

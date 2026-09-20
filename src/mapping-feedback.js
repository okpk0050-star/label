export function mappingAlertText(sourceCount, needsReview, confidence, fieldNames) {
  if (sourceCount >= 3 && needsReview / sourceCount >= 0.5) {
    return '⚠ 대부분의 데이터를 정확하게 인식하지 못했습니다. 위의 이름·우편번호·주소 열이 올바르게 선택되었는지 확인해주세요.';
  }
  const uncertain = ['name', 'postcode', 'address'].filter((field) => !['high', 'manual'].includes(confidence[field]));
  return uncertain.length ? `⚠ ${uncertain.map((field) => fieldNames[field]).join('·')} 열을 확인해주세요. 아래 선택지와 예시값을 보고 직접 변경할 수 있습니다.` : '';
}
